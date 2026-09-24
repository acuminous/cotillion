const { AbortError, TimeoutError } = require('./errors');
const { SkipReason } = require('./events');
const { schedule } = require('./timer');
const { isPlainObject } = require('./validate-timeout');

function timeoutsOf(options) {
  const timeout = options?.timeout;
  if (isPlainObject(timeout)) return { start: timeout.start, stop: timeout.stop };
  return { start: timeout, stop: timeout };
}

function createDeadline(operation, timeout, waits, onExpire) {
  const controller = new AbortController();
  const expiry = schedule(timeout, expire);
  let interruption = null;

  function expire() {
    const error = new TimeoutError(describeExpiry(operation, timeout, waits.describe()));
    interrupt(SkipReason.Timeout, error);
    onExpire(error);
  }

  function abort() {
    interrupt(SkipReason.Abort, new AbortError(describeAbort(operation, waits.describe())));
  }

  function interrupt(reason, error) {
    if (interruption) return;
    interruption = { reason, error };
    controller.abort(error);
  }

  return {
    signal: controller.signal,
    get interruption() {
      return interruption;
    },
    abort,
    clear: expiry.clear,
  };
}

function describeExpiry(operation, timeout, waiting) {
  return `The ${operation} timed out after ${timeout}ms${describeWaiting(waiting, ' waiting for')}`;
}

function describeAbort(operation, waiting) {
  return `The ${operation} was aborted${describeWaiting(waiting, ' while waiting for')}`;
}

function describeWaiting(waiting, preamble) {
  if (waiting.length === 0) return '';
  return `${preamble} ${listNames(waiting)} to ${waiting[0].lifecycle}`;
}

function listNames(waiting) {
  const names = waiting.map((wait) => wait.name);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

module.exports = { createDeadline, timeoutsOf };
