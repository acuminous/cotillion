const { TimeoutError } = require('./errors');

function createDeadline(operation, timeout) {
  if (timeout === undefined) return createUnboundedDeadline();
  return createBoundedDeadline(operation, timeout);
}

function createUnboundedDeadline() {
  const { signal } = new AbortController();
  return { signal, waitFor: (lifecycle, entry, promise) => promise, clear() {} };
}

function createBoundedDeadline(operation, timeout) {
  const controller = new AbortController();
  const waiting = [];
  const timer = setTimeout(expire, timeout);

  function expire() {
    controller.abort(new TimeoutError(describeExpiry(operation, timeout, waiting)));
  }

  function waitFor(lifecycle, entry, promise) {
    const wait = { lifecycle, name: entry.name };
    waiting.push(wait);
    return settleBeforeAbort(promise, controller.signal).finally(() => remove(waiting, wait));
  }

  function clear() {
    clearTimeout(timer);
  }

  return { signal: controller.signal, waitFor, clear };
}

function settleBeforeAbort(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function remove(waiting, wait) {
  waiting.splice(waiting.indexOf(wait), 1);
}

function describeExpiry(operation, timeout, waiting) {
  return `The ${operation} timed out after ${timeout}ms${describeWaiting(waiting)}`;
}

function describeWaiting(waiting) {
  if (waiting.length === 0) return '';
  return ` waiting for ${listNames(waiting)} to ${waiting[0].lifecycle}`;
}

function listNames(waiting) {
  const names = waiting.map((wait) => wait.name);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

module.exports = { createDeadline };
