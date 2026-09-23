const { EventEmitter } = require('node:events');
const { ComponentEvent, SystemEvent } = require('./events');
const { validateComponents } = require('./validate-components');

const SkipReason = Object.freeze({ Missing: 'missing', Failure: 'failure', Unstarted: 'unstarted' });

function createSystem(components) {
  validateComponents(components);

  const system = new EventEmitter();
  const started = [];
  const unstarted = components.map(asUnstarted);
  let starting = null;
  let stopping = null;

  async function runStart() {
    stopping = null;
    unstarted.length = 0;
    system.emit(SystemEvent.StartInitiated);
    const startValues = await startComponents(system, components, started, unstarted, new AbortController().signal);
    system.emit(SystemEvent.StartSucceeded);
    return startValues;
  }

  async function runStop() {
    system.emit(SystemEvent.StopInitiated);
    await stopComponents(system, started, unstarted, new AbortController().signal);
    starting = null;
    system.emit(SystemEvent.StopSucceeded);
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

async function startComponents(system, components, started, unstarted, signal) {
  const startValues = {};
  for (const [index, component] of components.entries()) {
    const remaining = components.slice(index + 1);
    startValues[component.name] = await startEntry(system, component, signal).catch(
      announceStartFailure(system, component, remaining, unstarted),
    );
    started.push(component);
  }
  return startValues;
}

async function stopComponents(system, started, unstarted, signal) {
  skipUnstarted(system, unstarted);
  while (started.length > 0) {
    const component = started.at(-1);
    const remaining = started.slice(0, -1).reverse();
    await stopEntry(system, component, signal).catch(announceStopFailure(system, component, remaining));
    started.pop();
  }
}

async function startEntry(system, component, signal) {
  if (component.start) return startComponent(system, component, signal);
  return skip(system, ComponentEvent.StartSkipped, component, SkipReason.Missing);
}

async function stopEntry(system, component, signal) {
  if (component.stop) return stopComponent(system, component, signal);
  return skip(system, ComponentEvent.StopSkipped, component, SkipReason.Missing);
}

async function startComponent(system, component, signal) {
  system.emit(ComponentEvent.StartInitiated, { name: component.name });
  const startValue = await component.start(signal);
  system.emit(ComponentEvent.StartSucceeded, { name: component.name });
  return startValue;
}

async function stopComponent(system, component, signal) {
  system.emit(ComponentEvent.StopInitiated, { name: component.name });
  await component.stop(signal);
  system.emit(ComponentEvent.StopSucceeded, { name: component.name });
}

function announceStartFailure(system, component, remaining, unstarted) {
  return (error) => {
    system.emit(ComponentEvent.StartFailed, { name: component.name, error });
    unstarted.push({ component, reason: SkipReason.Failure });
    for (const entry of remaining) {
      skip(system, ComponentEvent.StartSkipped, entry, SkipReason.Failure);
      unstarted.push({ component: entry, reason: SkipReason.Failure });
    }
    throw error;
  };
}

function announceStopFailure(system, component, remaining) {
  return (error) => {
    system.emit(ComponentEvent.StopFailed, { name: component.name, error });
    for (const entry of remaining) skip(system, ComponentEvent.StopSkipped, entry, SkipReason.Failure);
    throw error;
  };
}

function asUnstarted(component) {
  return { component, reason: SkipReason.Unstarted };
}

function skipUnstarted(system, unstarted) {
  for (const { component, reason } of unstarted.toReversed()) {
    skip(system, ComponentEvent.StopSkipped, component, reason);
  }
}

function skip(system, event, component, reason) {
  system.emit(event, { name: component.name, reason });
}

module.exports = { createSystem, ComponentEvent, SystemEvent };
