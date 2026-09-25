const { SystemEvent, createSystem } = require('../../lib');

const [behaviour] = process.argv.slice(2);

const postgres = {
  name: 'postgres',
  async start() {
    if (behaviour === 'start-fails') throw new Error('connection refused');
    return 'a connection';
  },
  async stop() {
    if (behaviour === 'stop-fails') throw new Error('could not disconnect');
  },
};

const system = createSystem([postgres]);

for (const event of Object.values(SystemEvent)) system.on(event, () => console.log(event));

const unbind = system.exitOn('shutdown');

if (behaviour === 'unbound') unbind();

system.start().then(stopAndSurvive, ignore);

async function stopAndSurvive() {
  process.emit('shutdown');
  await system.stop();
  process.exitCode = 7;
}

function ignore() {}
