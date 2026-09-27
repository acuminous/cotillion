const { ComponentEvent, SystemEvent, createSystem } = require('../../lib');

const [behaviour] = process.argv.slice(2);

let reportFailure;

const postgres = {
  name: 'postgres',
  async start(components, { fail }) {
    reportFailure = fail;
    if (behaviour === 'start-fails') throw new Error('connection refused');
    return 'a connection';
  },
  async stop() {
    if (behaviour === 'stop-fails') throw new Error('could not disconnect');
  },
};

const system = createSystem([postgres]);

for (const event of [...Object.values(SystemEvent), ...Object.values(ComponentEvent)])
  system.on(event, () => console.log(event));

const unbind = system.exitOn('shutdown');

if (behaviour === 'unbound') unbind();

const afterStart = {
  clean: signal,
  'stop-fails': signal,
  unbound: stopAndSurvive,
  'component-fails': failThenRestart,
};

system.start().then(afterStart[behaviour]);

function signal() {
  process.emit('shutdown');
}

async function stopAndSurvive() {
  process.emit('shutdown');
  await system.stop();
  process.exitCode = 7;
}

function failThenRestart() {
  system.on(ComponentEvent.Failed, restartThenSignal);
  reportFailure(new Error('connection lost'));
}

async function restartThenSignal() {
  await system.restart();
  process.exitCode = 3;
  process.emit('shutdown');
}
