class TimeoutError extends Error {
  get name() {
    return 'TimeoutError';
  }
}

module.exports = { TimeoutError };
