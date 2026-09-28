function exitWhenStopped(stopping, code) {
  return stopping.then(exitWith(code), exitFailedWith(code));
}

function exitWith(code) {
  if (code === undefined) return exitWithProcessExitCode;
  return () => process.exit(code);
}

function exitWithProcessExitCode() {
  process.exit();
}

function exitFailedWith(code) {
  return () => process.exit(code || 1);
}

module.exports = { exitWhenStopped };
