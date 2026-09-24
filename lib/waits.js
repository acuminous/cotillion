const Outcome = Object.freeze({
  Succeeded: 'succeeded',
  Failed: 'failed',
  Aborted: 'aborted',
});

function createWaits() {
  const pending = [];

  function waitFor(lifecycle, entry, signal, invoke) {
    const wait = createWait(lifecycle, entry, signal);
    pending.push(wait);
    wait.begin(invoke);
    return wait.outcome.finally(() => remove(pending, wait));
  }

  function fail(error) {
    for (const wait of [...pending]) wait.fail(error);
  }

  function describe() {
    return pending.map(({ lifecycle, name }) => ({ lifecycle, name }));
  }

  return { waitFor, fail, describe };
}

function createWait(lifecycle, entry, signal) {
  const { promise, resolve } = Promise.withResolvers();

  function begin(invoke) {
    invoked(invoke).then(
      (value) => resolve({ outcome: Outcome.Succeeded, value }),
      (error) => resolve({ outcome: rejectionOutcome(signal), error }),
    );
  }

  function fail(error) {
    resolve({ outcome: Outcome.Failed, error });
  }

  return { lifecycle, name: entry.name, begin, fail, outcome: promise };
}

function rejectionOutcome(signal) {
  if (signal.aborted) return Outcome.Aborted;
  return Outcome.Failed;
}

async function invoked(invoke) {
  return invoke();
}

function remove(pending, wait) {
  pending.splice(pending.indexOf(wait), 1);
}

module.exports = { createWaits, Outcome };
