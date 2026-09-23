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
  Unstarted: 'unstarted',
});

function createSystem(definition) {
  validateDefinition(definition);

  const system = new EventEmitter();
  const standing = [];
  let components = {};
  let unstarted = definition.map(asUnstarted);
  let starting = null;
  let stopping = null;

  async function startSystem(deadline) {
    stopping = null;
    unstarted = [];
    system.emit(SystemEvent.StartInitiated);
    const produced = await startComponents(system, definition, standing, unstarted, deadline).catch(
      announceSystemFailure(system, SystemEvent.StartFailed),
    );
    Object.assign(components, produced);
    starting = null;
    system.emit(SystemEvent.StartSucceeded);
    return components;
  }

  async function stopSystem(deadline) {
    system.emit(SystemEvent.StopInitiated);
    await stopComponents(system, standing, unstarted, deadline).catch(
      announceSystemFailure(system, SystemEvent.StopFailed),
    );
    resetToStopped();
    system.emit(SystemEvent.StopSucceeded);
  }

  function resetToStopped() {
    components = {};
    unstarted = definition.map(asUnstarted);
    starting = null;
    stopping = null;
  }

  function allowRetry(error) {
    stopping = null;
    throw error;
  }

  function beginStart(deadline) {
    starting ??= startSystem(deadline);
    return starting;
  }

  function beginStop(deadline) {
    stopping ??= stopSystem(deadline).catch(allowRetry);
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

async function startComponents(system, definition, standing, unstarted, deadline) {
  const components = {};
  for (const [index, entry] of definition.entries()) {
    if (isStanding(standing, entry)) {
      skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Started);
      continue;
    }
    if (deadline.signal.aborted) {
      skipStart(system, entry, SkipReason.Timeout, unstarted);
      continue;
    }
    const remaining = definition.slice(index + 1);
    components[entry.name] = await startEntry(system, entry, deadline).catch(
      announceStartInterruption(system, entry, remaining, standing, unstarted, deadline),
    );
    standing.push(entry);
  }
  deadline.signal.throwIfAborted();
  return components;
}

function isStanding(standing, entry) {
  return standing.includes(entry);
}

async function stopComponents(system, standing, unstarted, deadline) {
  skipUnstarted(system, unstarted);
  while (standing.length > 0) {
    const entry = standing.at(-1);
    const remaining = standing.slice(0, -1).reverse();
    await stopEntry(system, entry, deadline).catch(announceStopInterruption(system, entry, remaining, deadline));
    standing.pop();
  }
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

function announceStartInterruption(system, entry, remaining, standing, unstarted, deadline) {
  return (error) => {
    if (deadline.signal.aborted) return abandonStart(system, entry, remaining, standing, unstarted, error);
    return failStart(system, entry, remaining, unstarted, error);
  };
}

function abandonStart(system, entry, remaining, standing, unstarted, error) {
  system.emit(ComponentEvent.StartAborted, { name: entry.name, reason: SkipReason.Timeout });
  standing.push(entry);
  for (const skipped of remaining) skipStart(system, skipped, SkipReason.Timeout, unstarted);
  throw error;
}

function failStart(system, entry, remaining, unstarted, error) {
  system.emit(ComponentEvent.StartFailed, { name: entry.name, error });
  unstarted.push({ entry, reason: SkipReason.Failure });
  for (const skipped of remaining) skipStart(system, skipped, SkipReason.Failure, unstarted);
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

function asUnstarted(entry) {
  return { entry, reason: SkipReason.Unstarted };
}

function skipUnstarted(system, unstarted) {
  for (const { entry, reason } of unstarted.toReversed()) {
    skip(system, ComponentEvent.StopSkipped, entry, reason);
  }
}

function skipStart(system, entry, reason, unstarted) {
  skip(system, ComponentEvent.StartSkipped, entry, reason);
  unstarted.push({ entry, reason });
}

function skip(system, event, entry, reason) {
  system.emit(event, { name: entry.name, reason });
}

module.exports = { createSystem, ComponentEvent, SystemEvent, TimeoutError };
