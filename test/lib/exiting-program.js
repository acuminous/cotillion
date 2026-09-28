const { ComponentEvent, SystemEvent, createSystem } = require('../../lib');

const [behaviour, failure, code] = process.argv.slice(2);

const exitCode = code === 'none' ? undefined : Number(code);

let reportFailure;
let connection;

const postgres = {
  name: 'postgres',
  async start(components, { fail }) {
    reportFailure = fail;
    if (failure === 'start-fails') throw new Error('connection refused');
    connection = setInterval(() => {}, 1000);
    return connection;
  },
  async stop() {
    clearInterval(connection);
    if (failure === 'stop-fails') throw new Error('could not disconnect');
  },
};

const system = createSystem([postgres]);

for (const event of [...Object.values(SystemEvent), ...Object.values(ComponentEvent)])
  system.on(event, () => console.log(event));

const unbind = system.exitOn('shutdown', 'SIGTERM');

if (behaviour === 'unbound') unbind();

const insteadOfStarting = {
  'exit-without-starting': exit,
};

const whileStarting = {
  'exit-while-starting': exit,
};

const afterStart = {
  signal,
  terminate,
  unbound: stopAndSurvive,
  'component-fails': failThenRestart,
  exit,
  'exit-after-setting-exit-code': setExitCodeThenExit,
  'exit-after-stopping': stopThenExit,
};

const afterFailedStart = {
  'exit-when-start-fails': exit,
};

const starting = (insteadOfStarting[behaviour] ?? startSystem)();

whileStarting[behaviour]?.();

starting.then(afterStart[behaviour], afterFailedStart[behaviour]);

function startSystem() {
  return system.start();
}

function signal() {
  process.emit('shutdown');
}

function terminate() {
  process.kill(process.pid, 'SIGTERM');
}

function exit() {
  return system.exit(exitCode);
}

function setExitCodeThenExit() {
  process.exitCode = 5;
  system.exit();
}

async function stopThenExit() {
  await system.stop().catch(alreadyAnnounced);
  system.exit(exitCode);
}

function alreadyAnnounced() {}

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
