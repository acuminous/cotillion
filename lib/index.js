const { EventEmitter } = require('node:events');
const { ComponentEvent, SystemEvent } = require('./events');
const { validateComponents } = require('./validate-components');

function createSystem(components) {
  validateComponents(components);

  const system = new EventEmitter();

  return Object.assign(system, {
    async start() {
      system.emit(SystemEvent.StartInitiated);
      system.emit(SystemEvent.StartSucceeded);
      return {};
    },
    async stop() {
      system.emit(SystemEvent.StopInitiated);
      system.emit(SystemEvent.StopSucceeded);
    },
  });
}

module.exports = { createSystem, ComponentEvent, SystemEvent };
