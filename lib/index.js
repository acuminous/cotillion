const { EventEmitter } = require('node:events');

function createSystem() {
  const system = new EventEmitter();

  return Object.assign(system, {
    async start() {
      system.emit('system_start_initiated');
      system.emit('system_start_succeeded');
      return {};
    },
    async stop() {
      system.emit('system_stop_initiated');
      system.emit('system_stop_succeeded');
    },
  });
}

module.exports = { createSystem };
