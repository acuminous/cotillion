function validateExitCode(code) {
  if (code === undefined || Number.isInteger(code)) return;
  throw new Error('The exit code must be an integer');
}

module.exports = { validateExitCode };
