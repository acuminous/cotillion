const { EventEmitter } = require('node:events');
const { ComponentEvent, SystemEvent } = require('./events');
const { validateComponents } = require('./validate-components');

function createSystem(components) {
  validateComponents(components);

  const system = new EventEmitter();
  let starting = null;

  async function runStart() {
    system.emit(SystemEvent.StartInitiated);
    const startValues = await startComponents(components, new AbortController().signal);
    system.emit(SystemEvent.StartSucceeded);
    return startValues;
  }

  return Object.assign(system, {
    start() {
      starting ??= runStart();
      return starting;
    },
    async stop() {
      starting = null;
      system.emit(SystemEvent.StopInitiated);
      system.emit(SystemEvent.StopSucceeded);
    },
  });
}

async function startComponents(components, signal) {
  const startValues = {};
  for (const component of components) {
    startValues[component.name] = await component.start?.(signal);
  }
  return startValues;
}

module.exports = { createSystem, ComponentEvent, SystemEvent };
