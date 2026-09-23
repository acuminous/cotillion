class TimeoutError extends Error {
  get name() {
    return 'TimeoutError';
  }
}

class AbortError extends Error {
  get name() {
    return 'AbortError';
  }
}

module.exports = { AbortError, TimeoutError };
