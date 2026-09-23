const { EventEmitter } = require('node:events');
const { ComponentEvent, SystemEvent } = require('./events');
const { validateComponents } = require('./validate-components');

function createSystem(components) {
  validateComponents(components);

  const system = new EventEmitter();
  const started = [];
  let starting = null;
  let stopping = null;

  async function runStart() {
    stopping = null;
    system.emit(SystemEvent.StartInitiated);
    const startValues = await startComponents(components, started, new AbortController().signal);
    system.emit(SystemEvent.StartSucceeded);
    return startValues;
  }

  async function runStop() {
    system.emit(SystemEvent.StopInitiated);
    await stopComponents(started, new AbortController().signal);
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

async function startComponents(components, started, signal) {
  const startValues = {};
  for (const component of components) {
    startValues[component.name] = await component.start?.(signal);
    started.push(component);
  }
  return startValues;
}

async function stopComponents(started, signal) {
  while (started.length > 0) {
    await started.at(-1).stop?.(signal);
    started.pop();
  }
}

module.exports = { createSystem, ComponentEvent, SystemEvent };
