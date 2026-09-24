const { timeoutsOf } = require('./deadline');
const { TimeoutError } = require('./errors');
const { schedule } = require('./timer');

const Outcome = Object.freeze({
  Succeeded: 'succeeded',
  Failed: 'failed',
  Aborted: 'aborted',
});

const activities = { start: 'starting', stop: 'stopping' };

const inert = new AbortController().signal;

function createWaits() {
  const pending = [];

  function waitFor(lifecycle, entry, deadlineSignal, invoke) {
    const wait = createWait(lifecycle, entry, deadlineSignal);
    pending.push(wait);
    wait.begin(invoke);
    return wait.outcome.finally(() => {
      remove(pending, wait);
      wait.clear();
    });
  }

  function fail(error) {
    for (const wait of [...pending]) wait.fail(error);
  }

  function describe() {
    return pending.map(({ lifecycle, name }) => ({ lifecycle, name }));
  }

  return { waitFor, fail, describe };
}

function createWait(lifecycle, entry, deadlineSignal) {
  const { promise, resolve } = Promise.withResolvers();
  const own = new AbortController();
  const signal = signalFor(deadlineSignal, own);
  const timeout = timeoutsOf(entry)[lifecycle];
  const expiry = schedule(timeout, expire);

  function begin(invoke) {
    invoked(() => invoke(signal)).then(
      (value) => resolve({ outcome: Outcome.Succeeded, value }),
      (error) => resolve({ outcome: rejectionOutcome(signal), error }),
    );
  }

  function fail(error) {
    resolve({ outcome: Outcome.Failed, error });
  }

  function expire() {
    const error = new TimeoutError(describeExpiry(entry.name, lifecycle, timeout));
    fail(error);
    own.abort(error);
  }

  return { lifecycle, name: entry.name, begin, fail, clear: expiry.clear, outcome: promise };
}

function signalFor(deadlineSignal, own) {
  if (deadlineSignal === null) return inert;
  return AbortSignal.any([deadlineSignal, own.signal]);
}

function rejectionOutcome(signal) {
  if (signal.aborted) return Outcome.Aborted;
  return Outcome.Failed;
}

function describeExpiry(name, lifecycle, timeout) {
  return `The component ${name} timed out after ${timeout}ms while ${activities[lifecycle]}`;
}

async function invoked(invoke) {
  return invoke();
}

function remove(pending, wait) {
  pending.splice(pending.indexOf(wait), 1);
}

module.exports = { createWaits, Outcome };
