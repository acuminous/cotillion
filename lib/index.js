const { EventEmitter } = require('node:events');
const { ComponentEvent, SystemEvent } = require('./events');
const { validateDefinition } = require('./validate-definition');

const SkipReason = Object.freeze({
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

  async function runStart() {
    stopping = null;
    unstarted = [];
    system.emit(SystemEvent.StartInitiated);
    const signal = new AbortController().signal;
    const started = await startComponents(system, definition, standing, unstarted, signal).catch(
      announceSystemFailure(system, SystemEvent.StartFailed),
    );
    Object.assign(components, started);
    starting = null;
    system.emit(SystemEvent.StartSucceeded);
    return components;
  }

  async function runStop() {
    system.emit(SystemEvent.StopInitiated);
    const signal = new AbortController().signal;
    await stopComponents(system, standing, unstarted, signal).catch(
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

  function start() {
    starting ??= runStart();
    return starting;
  }

  function stop() {
    stopping ??= runStop().catch(allowRetry);
    return stopping;
  }

  async function restart() {
    await stop();
    return start();
  }

  return Object.assign(system, { start, stop, restart });
}

async function startComponents(system, definition, standing, unstarted, signal) {
  const components = {};
  for (const [index, entry] of definition.entries()) {
    if (isStanding(standing, entry)) {
      skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Started);
      continue;
    }
    const remaining = definition.slice(index + 1);
    components[entry.name] = await startEntry(system, entry, signal).catch(
      announceStartFailure(system, entry, remaining, unstarted),
    );
    standing.push(entry);
  }
  return components;
}

function isStanding(standing, entry) {
  return standing.includes(entry);
}

async function stopComponents(system, standing, unstarted, signal) {
  skipUnstarted(system, unstarted);
  while (standing.length > 0) {
    const entry = standing.at(-1);
    const remaining = standing.slice(0, -1).reverse();
    await stopEntry(system, entry, signal).catch(announceStopFailure(system, entry, remaining));
    standing.pop();
  }
}

async function startEntry(system, entry, signal) {
  if (entry.start) return startComponent(system, entry, signal);
  return skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Missing);
}

async function stopEntry(system, entry, signal) {
  if (entry.stop) return stopComponent(system, entry, signal);
  return skip(system, ComponentEvent.StopSkipped, entry, SkipReason.Missing);
}

async function startComponent(system, entry, signal) {
  system.emit(ComponentEvent.StartInitiated, { name: entry.name });
  const component = await entry.start(signal);
  system.emit(ComponentEvent.StartSucceeded, { name: entry.name });
  return component;
}

async function stopComponent(system, entry, signal) {
  system.emit(ComponentEvent.StopInitiated, { name: entry.name });
  await entry.stop(signal);
  system.emit(ComponentEvent.StopSucceeded, { name: entry.name });
}

function announceSystemFailure(system, event) {
  return (error) => {
    system.emit(event, error);
    throw error;
  };
}

function announceStartFailure(system, entry, remaining, unstarted) {
  return (error) => {
    system.emit(ComponentEvent.StartFailed, { name: entry.name, error });
    unstarted.push({ entry, reason: SkipReason.Failure });
    for (const skipped of remaining) {
      skip(system, ComponentEvent.StartSkipped, skipped, SkipReason.Failure);
      unstarted.push({ entry: skipped, reason: SkipReason.Failure });
    }
    throw error;
  };
}

function announceStopFailure(system, entry, remaining) {
  return (error) => {
    system.emit(ComponentEvent.StopFailed, { name: entry.name, error });
    for (const skipped of remaining) skip(system, ComponentEvent.StopSkipped, skipped, SkipReason.Failure);
    throw error;
  };
}

function asUnstarted(entry) {
  return { entry, reason: SkipReason.Unstarted };
}

function skipUnstarted(system, unstarted) {
  for (const { entry, reason } of unstarted.toReversed()) {
    skip(system, ComponentEvent.StopSkipped, entry, reason);
  }
}

function skip(system, event, entry, reason) {
  system.emit(event, { name: entry.name, reason });
}

module.exports = { createSystem, ComponentEvent, SystemEvent };
