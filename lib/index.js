const { EventEmitter } = require('node:events');
const { createDeadline } = require('./deadline');
const { TimeoutError } = require('./errors');
const { ComponentEvent, SystemEvent } = require('./events');
const { validateDefinition } = require('./validate-definition');

const SkipReason = Object.freeze({
  Timeout: 'timeout',
  Missing: 'missing',
  Failure: 'failure',
  Started: 'started',
  Stopped: 'stopped',
});

function createSystem(definition) {
  validateDefinition(definition);

  const system = new EventEmitter();
  const states = new Map(definition.map(asStopped));
  let components = {};
  let starting = null;
  let stopping = null;

  async function startSystem(deadline) {
    stopping = null;
    system.emit(SystemEvent.StartInitiated);
    const produced = await startComponents(system, definition, states, deadline).catch(
      announceSystemFailure(system, SystemEvent.StartFailed),
    );
    Object.assign(components, produced);
    starting = null;
    system.emit(SystemEvent.StartSucceeded);
    return components;
  }

  async function stopSystem(deadline) {
    system.emit(SystemEvent.StopInitiated);
    await stopComponents(system, definition, states, deadline).catch(
      announceSystemFailure(system, SystemEvent.StopFailed),
    );
    resetSystem();
    system.emit(SystemEvent.StopSucceeded);
  }

  function resetSystem() {
    components = {};
    for (const entry of definition) states.set(entry, SkipReason.Stopped);
    starting = null;
    stopping = null;
  }

  function forgetFailedStop(error) {
    stopping = null;
    throw error;
  }

  function beginStart(deadline) {
    starting ??= startSystem(deadline);
    return starting;
  }

  function beginStop(deadline) {
    stopping ??= stopSystem(deadline).catch(forgetFailedStop);
    return stopping;
  }

  async function beginRestart(deadline) {
    await beginStop(deadline);
    return beginStart(deadline);
  }

  function start(options) {
    return withDeadline('start', beginStart, options);
  }

  function stop(options) {
    return withDeadline('stop', beginStop, options);
  }

  function restart(options) {
    return withDeadline('restart', beginRestart, options);
  }

  return Object.assign(system, { start, stop, restart });
}

function withDeadline(operation, begin, { timeout } = {}) {
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
    if (deadline.signal.aborted) {
      skipStart(system, entry, SkipReason.Timeout, states);
      continue;
    }
    const remaining = definition.slice(index + 1);
    components[entry.name] = await startEntry(system, entry, deadline).catch(
      announceStartInterruption(system, entry, remaining, states, deadline),
    );
    states.set(entry, SkipReason.Started);
  }
  deadline.signal.throwIfAborted();
  return components;
}

async function stopComponents(system, definition, states, deadline) {
  const stopOrder = definition.toReversed();
  skipStops(system, stopOrder, states);
  const started = stopOrder.filter((entry) => isStarted(states, entry));
  for (const [index, entry] of started.entries()) {
    const remaining = started.slice(index + 1);
    await stopEntry(system, entry, deadline).catch(announceStopInterruption(system, entry, remaining, deadline));
    states.set(entry, SkipReason.Stopped);
  }
}

function isStarted(states, entry) {
  return states.get(entry) === SkipReason.Started;
}

async function startEntry(system, entry, deadline) {
  if (entry.start) return startComponent(system, entry, deadline);
  return skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Missing);
}

async function stopEntry(system, entry, deadline) {
  if (entry.stop) return stopComponent(system, entry, deadline);
  return skip(system, ComponentEvent.StopSkipped, entry, SkipReason.Missing);
}

async function startComponent(system, entry, deadline) {
  system.emit(ComponentEvent.StartInitiated, { name: entry.name });
  const component = await deadline.waitFor('start', entry, entry.start(deadline.signal));
  system.emit(ComponentEvent.StartSucceeded, { name: entry.name });
  return component;
}

async function stopComponent(system, entry, deadline) {
  system.emit(ComponentEvent.StopInitiated, { name: entry.name });
  await deadline.waitFor('stop', entry, entry.stop(deadline.signal));
  system.emit(ComponentEvent.StopSucceeded, { name: entry.name });
}

function announceSystemFailure(system, event) {
  return (error) => {
    system.emit(event, error);
    throw error;
  };
}

function announceStartInterruption(system, entry, remaining, states, deadline) {
  return (error) => {
    if (deadline.signal.aborted) return abandonStart(system, entry, remaining, states, error);
    return failStart(system, entry, remaining, states, error);
  };
}

function abandonStart(system, entry, remaining, states, error) {
  system.emit(ComponentEvent.StartAborted, { name: entry.name, reason: SkipReason.Timeout });
  states.set(entry, SkipReason.Started);
  for (const skipped of remaining) skipStart(system, skipped, SkipReason.Timeout, states);
  throw error;
}

function failStart(system, entry, remaining, states, error) {
  system.emit(ComponentEvent.StartFailed, { name: entry.name, error });
  states.set(entry, SkipReason.Failure);
  for (const skipped of remaining) skipStart(system, skipped, SkipReason.Failure, states);
  throw error;
}

function announceStopInterruption(system, entry, remaining, deadline) {
  return (error) => {
    if (deadline.signal.aborted) return abandonStop(system, entry, remaining, error);
    return failStop(system, entry, remaining, error);
  };
}

function abandonStop(system, entry, remaining, error) {
  system.emit(ComponentEvent.StopAborted, { name: entry.name, reason: SkipReason.Timeout });
  for (const skipped of remaining) skip(system, ComponentEvent.StopSkipped, skipped, SkipReason.Timeout);
  throw error;
}

function failStop(system, entry, remaining, error) {
  system.emit(ComponentEvent.StopFailed, { name: entry.name, error });
  for (const skipped of remaining) skip(system, ComponentEvent.StopSkipped, skipped, SkipReason.Failure);
  throw error;
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

module.exports = { createSystem, ComponentEvent, SystemEvent, TimeoutError };
