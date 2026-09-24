const { EventEmitter } = require('node:events');
const { createDeadline, timeoutsOf } = require('./deadline');
const { AbortError, TimeoutError } = require('./errors');
const { ComponentEvent, SkipReason, SystemEvent } = require('./events');
const { validateDefinition } = require('./validate-definition');
const { validateOptions } = require('./validate-options');
const { Outcome, createWaits } = require('./waits');

const inert = new AbortController().signal;

function createSystem(definition, options) {
  validateDefinition(definition);
  validateOptions(options);

  const system = new EventEmitter();
  const timeouts = timeoutsOf(options);
  const waits = createWaits();
  const states = new Map(definition.map(asStopped));
  let components = {};
  let starting = null;
  let stopping = null;
  let startDeadline = null;

  async function startSystem(deadline) {
    stopping = null;
    startDeadline = deadline;
    system.emit(SystemEvent.StartInitiated);
    const started = await startComponents(system, definition, states, waits, deadline)
      .finally(clearStartDeadline)
      .catch(announceSystemFailure(system, SystemEvent.StartFailed));
    Object.assign(components, started);
    starting = null;
    system.emit(SystemEvent.StartSucceeded);
    return components;
  }

  async function stopSystem(deadline) {
    system.emit(SystemEvent.StopInitiated);
    await interruptStart();
    await stopComponents(system, definition, states, waits, deadline).catch(
      announceSystemFailure(system, SystemEvent.StopFailed),
    );
    resetSystem();
    system.emit(SystemEvent.StopSucceeded);
  }

  async function interruptStart() {
    if (!startDeadline) return;
    startDeadline.abort();
    await starting.walk.catch(alreadyAnnounced);
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

  function clearStartDeadline() {
    startDeadline = null;
  }

  function runStart() {
    const deadline = createDeadline('start', timeouts.start, waits, stop);
    const walk = startSystem(deadline).finally(deadline.clear);
    return { walk, deadline };
  }

  function runStop() {
    const deadline = createDeadline('stop', timeouts.stop, waits, waits.fail);
    return stopSystem(deadline).catch(clearStopping).finally(deadline.clear);
  }

  function stopAfterFailure(deadline) {
    return async (error) => {
      if (deadline.interruption?.reason === SkipReason.Abort) throw error;
      await stop().catch(alreadyAnnounced);
      throw error;
    };
  }

  function start() {
    starting ??= runStart();
    return starting.walk.catch(stopAfterFailure(starting.deadline));
  }

  function stop() {
    stopping ??= runStop();
    return stopping;
  }

  async function restart() {
    await stop();
    return start();
  }

  return Object.assign(system, { start, stop, restart });
}

function alreadyAnnounced() {}

async function startComponents(system, definition, states, waits, deadline) {
  const components = {};
  for (const [index, entry] of definition.entries()) {
    if (isStarted(states, entry)) {
      skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Started);
      continue;
    }
    if (deadline.interruption) throw abandonStarts(system, definition.slice(index), states, deadline);
    const remaining = definition.slice(index + 1);
    components[entry.name] = await startEntry(system, entry, states, waits, deadline).catch(
      interruptStarts(system, remaining, states, deadline),
    );
  }
  if (deadline.interruption) throw deadline.interruption.error;
  return components;
}

async function stopComponents(system, definition, states, waits, deadline) {
  const stopOrder = definition.toReversed();
  skipStops(system, stopOrder, states);
  const started = stopOrder.filter((entry) => isStarted(states, entry));
  for (const [index, entry] of started.entries()) {
    if (deadline.interruption) throw abandonStops(system, started.slice(index), deadline);
    const remaining = started.slice(index + 1);
    await stopEntry(system, entry, states, waits).catch(interruptStops(system, remaining, deadline));
  }
  if (deadline.interruption) throw deadline.interruption.error;
}

function isStarted(states, entry) {
  return states.get(entry) === SkipReason.Started;
}

async function startEntry(system, entry, states, waits, deadline) {
  if (entry.start) return startComponent(system, entry, states, waits, deadline);
  skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Missing);
  states.set(entry, SkipReason.Started);
}

async function stopEntry(system, entry, states, waits) {
  if (entry.stop) return stopComponent(system, entry, states, waits);
  skip(system, ComponentEvent.StopSkipped, entry, SkipReason.Missing);
  states.set(entry, SkipReason.Stopped);
}

async function startComponent(system, entry, states, waits, deadline) {
  const signal = signalFor(entry, deadline);
  const result = await waits.waitFor('start', entry, signal, () => invokeStart(system, entry, signal));
  return startOutcomes[result.outcome](system, entry, states, result, deadline);
}

async function stopComponent(system, entry, states, waits) {
  const result = await waits.waitFor('stop', entry, inert, () => invokeStop(system, entry));
  return stopOutcomes[result.outcome](system, entry, states, result);
}

function signalFor(entry, deadline) {
  if (entry.abortable) return deadline.signal;
  return inert;
}

function invokeStart(system, entry, signal) {
  system.emit(ComponentEvent.StartInitiated, { name: entry.name });
  return entry.start(signal);
}

function invokeStop(system, entry) {
  system.emit(ComponentEvent.StopInitiated, { name: entry.name });
  return entry.stop();
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
  [Outcome.Aborted]: (system, entry, states, { error }, deadline) => {
    system.emit(ComponentEvent.StartAborted, { name: entry.name, reason: deadline.interruption.reason });
    states.set(entry, SkipReason.Abort);
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
};

function announceSystemFailure(system, event) {
  return (error) => {
    system.emit(event, error);
    throw error;
  };
}

function interruptStarts(system, remaining, states, deadline) {
  return (error) => {
    if (deadline.interruption) throw abandonStarts(system, remaining, states, deadline);
    throw failStarts(system, remaining, states, error);
  };
}

function abandonStarts(system, entries, states, deadline) {
  for (const entry of entries) skipStart(system, entry, deadline.interruption.reason, states);
  return deadline.interruption.error;
}

function failStarts(system, entries, states, error) {
  for (const entry of entries) skipStart(system, entry, SkipReason.Failure, states);
  return error;
}

function interruptStops(system, remaining, deadline) {
  return (error) => {
    if (deadline.interruption) throw abandonStops(system, remaining, deadline);
    throw failStops(system, remaining, error);
  };
}

function abandonStops(system, entries, deadline) {
  for (const entry of entries) skip(system, ComponentEvent.StopSkipped, entry, deadline.interruption.reason);
  return deadline.interruption.error;
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
