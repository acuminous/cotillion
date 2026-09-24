const { AbortError, TimeoutError } = require('./errors');
const { SkipReason } = require('./events');
const { isPlainObject } = require('./validate-timeout');

const Outcome = Object.freeze({
  Succeeded: 'succeeded',
  Failed: 'failed',
  Aborted: 'aborted',
});

function timeoutsOf(options) {
  const timeout = options?.timeout;
  if (isPlainObject(timeout)) return { start: timeout.start, stop: timeout.stop };
  return { start: timeout, stop: timeout };
}

function createDeadline(operation, timeout) {
  const controller = new AbortController();
  const waiting = [];
  const expiry = schedule(timeout, expire);
  let reason;

  function expire() {
    interrupt(SkipReason.Timeout, new TimeoutError(describeExpiry(operation, timeout, waiting)));
  }

  function abort() {
    if (controller.signal.aborted) return cutAway();
    interrupt(SkipReason.Abort, new AbortError(describeAbort(operation, waiting)));
  }

  function interrupt(skipReason, error) {
    reason = skipReason;
    controller.abort(error);
  }

  function cutAway() {
    for (const wait of [...waiting]) wait.cutAway();
  }

  function waitFor(lifecycle, entry, invoke) {
    const wait = createWait(lifecycle, entry, controller.signal, () => reason);
    waiting.push(wait);
    wait.begin(invoke);
    return wait.outcome.finally(() => remove(waiting, wait));
  }

  return {
    signal: controller.signal,
    get reason() {
      return reason;
    },
    waitFor,
    abort,
    clear: expiry.clear,
  };
}

function createWait(lifecycle, entry, signal, reasonOf) {
  const { promise, resolve } = Promise.withResolvers();
  let grace = schedule(undefined);

  function begin(invoke) {
    invoked(invoke).then(
      (value) => resolve({ outcome: Outcome.Succeeded, value }),
      (error) => resolve({ outcome: Outcome.Failed, error }),
    );
  }

  function cutAway() {
    resolve({ outcome: Outcome.Aborted, error: signal.reason, reason: reasonOf() });
  }

  function beginGrace() {
    grace = schedule(abortTimeoutOf(entry), cutAway);
  }

  function settle() {
    grace.clear();
    signal.removeEventListener('abort', beginGrace);
  }

  signal.addEventListener('abort', beginGrace, { once: true });

  return { lifecycle, name: entry.name, begin, cutAway, outcome: promise.finally(settle) };
}

async function invoked(invoke) {
  return invoke();
}

function schedule(delay, fn) {
  if (delay === undefined) return { clear() {} };
  const timer = setTimeout(fn, delay);
  return { clear: () => clearTimeout(timer) };
}

function abortTimeoutOf(entry) {
  return entry.timeout?.abort;
}

function remove(waiting, wait) {
  waiting.splice(waiting.indexOf(wait), 1);
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

module.exports = { createDeadline, timeoutsOf, Outcome };
