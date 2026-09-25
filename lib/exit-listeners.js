const { SystemEvent } = require('./events');

function bindExitListeners(system) {
  const listeners = [
    [SystemEvent.StartFailed, recordFailure],
    [SystemEvent.StopSucceeded, exit],
    [SystemEvent.StopFailed, exitFailed],
  ];
  for (const [event, listener] of listeners) system.on(event, listener);
  return () => {
    for (const [event, listener] of listeners) system.off(event, listener);
  };
}

function recordFailure() {
  process.exitCode = 1;
}

function exit() {
  process.exit();
}

function exitFailed() {
  process.exit(1);
}

module.exports = { bindExitListeners };
