const { EventEmitter } = require('node:events');
const { ComponentEvent, SystemEvent } = require('./events');

function createSystem() {
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
