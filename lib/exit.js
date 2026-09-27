function exitWhenStopped(stopping) {
  return stopping.then(exitSucceeded, exitFailed);
}

function exitSucceeded() {
  process.exit();
}

function exitFailed() {
  process.exit(1);
}

module.exports = { exitWhenStopped };
