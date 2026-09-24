const { EventEmitter } = require('node:events');
const { Outcome, createDeadline, timeoutsOf } = require('./deadline');
const { AbortError, TimeoutError } = require('./errors');
const { ComponentEvent, SkipReason, SystemEvent } = require('./events');
const { validateDefinition } = require('./validate-definition');
const { validateOptions } = require('./validate-options');

function createSystem(definition, options) {
  validateDefinition(definition);
  validateOptions(options);

  const system = new EventEmitter();
  const timeouts = timeoutsOf(options);
  const states = new Map(definition.map(asStopped));
  let components = {};
  let starting = null;
  let stopping = null;
  let active = null;

  async function startSystem(deadline) {
    stopping = null;
    active = deadline;
    system.emit(SystemEvent.StartInitiated);
    const started = await startComponents(system, definition, states, deadline)
      .finally(clearActive)
      .catch(announceSystemFailure(system, SystemEvent.StartFailed));
    Object.assign(components, started);
    starting = null;
    system.emit(SystemEvent.StartSucceeded);
    return components;
  }

  async function stopSystem(deadline) {
    active = deadline;
    system.emit(SystemEvent.StopInitiated);
    await stopComponents(system, definition, states, deadline)
      .finally(clearActive)
      .catch(announceSystemFailure(system, SystemEvent.StopFailed));
    resetSystem();
    system.emit(SystemEvent.StopSucceeded);
  }

  function resetSystem() {
    components = {};
    for (const entry of definition) states.set(entry, SkipReason.Stopped);
    starting = null;
    stopping = null;
  }

  function clearStopping(error) {
    stopping = null;
    throw error;
  }

  function clearActive() {
    active = null;
  }

  function beginStart(deadline) {
    starting ??= startSystem(deadline);
    return starting.catch(stopAfterFailure(deadline));
  }

  function stopAfterFailure(deadline) {
    return async (error) => {
      if (deadline.signal.aborted) throw error;
      await stop().catch(alreadyAnnounced);
      throw error;
    };
  }

  function beginStop(deadline) {
    stopping ??= stopSystem(deadline).catch(clearStopping);
    return stopping;
  }

  function start() {
    return withDeadline('start', timeouts.start, beginStart);
  }

  function stop() {
    return withDeadline('stop', timeouts.stop, beginStop);
  }

  async function restart() {
    await stop();
    return start();
  }

  function abort() {
    active?.abort();
  }

  return Object.assign(system, { start, stop, restart, abort });
}

function alreadyAnnounced() {}

function withDeadline(operation, timeout, begin) {
  const deadline = createDeadline(operation, timeout);
  return begin(deadline).finally(deadline.clear);
}

async function startComponents(system, definition, states, deadline) {
  const components = {};
  for (const [index, entry] of definition.entries()) {
    if (isStarted(states, entry)) {
      skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Started);
      continue;
    }
    if (deadline.signal.aborted) throw abandonStarts(system, definition.slice(index), states, deadline);
    const remaining = definition.slice(index + 1);
    components[entry.name] = await startEntry(system, entry, states, deadline).catch(
      interruptStarts(system, remaining, states, deadline),
    );
  }
  deadline.signal.throwIfAborted();
  return components;
}

async function stopComponents(system, definition, states, deadline) {
  const stopOrder = definition.toReversed();
  skipStops(system, stopOrder, states);
  const started = stopOrder.filter((entry) => isStarted(states, entry));
  for (const [index, entry] of started.entries()) {
    if (deadline.signal.aborted) throw abandonStops(system, started.slice(index), deadline);
    const remaining = started.slice(index + 1);
    await stopEntry(system, entry, states, deadline).catch(interruptStops(system, remaining, deadline));
  }
  deadline.signal.throwIfAborted();
}

function isStarted(states, entry) {
  return states.get(entry) === SkipReason.Started;
}

async function startEntry(system, entry, states, deadline) {
  if (entry.start) return startComponent(system, entry, states, deadline);
  skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Missing);
  states.set(entry, SkipReason.Started);
}

async function stopEntry(system, entry, states, deadline) {
  if (entry.stop) return stopComponent(system, entry, states, deadline);
  skip(system, ComponentEvent.StopSkipped, entry, SkipReason.Missing);
  states.set(entry, SkipReason.Stopped);
}

async function startComponent(system, entry, states, deadline) {
  const result = await deadline.waitFor('start', entry, () => invokeStart(system, entry, deadline.signal));
  return startOutcomes[result.outcome](system, entry, states, result);
}

async function stopComponent(system, entry, states, deadline) {
  const result = await deadline.waitFor('stop', entry, () => invokeStop(system, entry, deadline.signal));
  return stopOutcomes[result.outcome](system, entry, states, result);
}

function invokeStart(system, entry, signal) {
  system.emit(ComponentEvent.StartInitiated, { name: entry.name });
  return entry.start(signal);
}

function invokeStop(system, entry, signal) {
  system.emit(ComponentEvent.StopInitiated, { name: entry.name });
  return entry.stop(signal);
}

const startOutcomes = {
  [Outcome.Succeeded]: (system, entry, states, { value }) => {
    system.emit(ComponentEvent.StartSucceeded, { name: entry.name });
    states.set(entry, SkipReason.Started);
    return value;
  },
  [Outcome.Failed]: (system, entry, states, { error }) => {
    system.emit(ComponentEvent.StartFailed, { name: entry.name, error });
    states.set(entry, SkipReason.Failure);
    throw error;
  },
  [Outcome.Aborted]: (system, entry, states, { error, reason }) => {
    system.emit(ComponentEvent.StartAborted, { name: entry.name, reason });
    states.set(entry, SkipReason.Started);
    throw error;
  },
};

const stopOutcomes = {
  [Outcome.Succeeded]: (system, entry, states) => {
    system.emit(ComponentEvent.StopSucceeded, { name: entry.name });
    states.set(entry, SkipReason.Stopped);
  },
  [Outcome.Failed]: (system, entry, states, { error }) => {
    system.emit(ComponentEvent.StopFailed, { name: entry.name, error });
    throw error;
  },
  [Outcome.Aborted]: (system, entry, states, { error, reason }) => {
    system.emit(ComponentEvent.StopAborted, { name: entry.name, reason });
    throw error;
  },
};

function announceSystemFailure(system, event) {
  return (error) => {
    system.emit(event, error);
    throw error;
  };
}

function interruptStarts(system, remaining, states, deadline) {
  return (error) => {
    if (deadline.signal.aborted) throw abandonStarts(system, remaining, states, deadline);
    throw failStarts(system, remaining, states, error);
  };
}

function abandonStarts(system, entries, states, deadline) {
  for (const entry of entries) skipStart(system, entry, deadline.reason, states);
  return deadline.signal.reason;
}

function failStarts(system, entries, states, error) {
  for (const entry of entries) skipStart(system, entry, SkipReason.Failure, states);
  return error;
}

function interruptStops(system, remaining, deadline) {
  return (error) => {
    if (deadline.signal.aborted) throw abandonStops(system, remaining, deadline);
    throw failStops(system, remaining, error);
  };
}

function abandonStops(system, entries, deadline) {
  for (const entry of entries) skip(system, ComponentEvent.StopSkipped, entry, deadline.reason);
  return deadline.signal.reason;
}

function failStops(system, entries, error) {
  for (const entry of entries) skip(system, ComponentEvent.StopSkipped, entry, SkipReason.Failure);
  return error;
}

function asStopped(entry) {
  return [entry, SkipReason.Stopped];
}

function skipStops(system, stopOrder, states) {
  for (const entry of stopOrder) {
    if (isStarted(states, entry)) continue;
    skip(system, ComponentEvent.StopSkipped, entry, states.get(entry));
  }
}

function skipStart(system, entry, reason, states) {
  skip(system, ComponentEvent.StartSkipped, entry, reason);
  states.set(entry, reason);
}

function skip(system, event, entry, reason) {
  system.emit(event, { name: entry.name, reason });
}

module.exports = { createSystem, ComponentEvent, SystemEvent, TimeoutError, AbortError };
