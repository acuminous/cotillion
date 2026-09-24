const { toStepDataRows } = require('./step-data-table');

function createComponentRecorder() {
  const invocations = [];

  function startsWith(entry, value) {
    records(entry, 'start', () => value);
  }

  function starts(entry) {
    records(entry, 'start', () => undefined);
  }

  function stops(entry) {
    records(entry, 'stop', () => undefined);
  }

  function startsOnDemand(entry) {
    records(entry, 'start', onDemand);
  }

  function stopsOnDemand(entry) {
    records(entry, 'stop', onDemand);
  }

  function hangsWhileStarting(entry) {
    records(entry, 'start', hangs);
  }

  function hangsWhileStopping(entry) {
    records(entry, 'stop', hangs);
  }

  function failsToStart(entry) {
    records(entry, 'start', rejects);
  }

  function failsToStop(entry) {
    records(entry, 'stop', rejects);
  }

  function records(entry, lifecycle, produce) {
    entry[lifecycle] = (...args) => {
      const invocation = { component: entry.name, lifecycle, args, settled: false, signal: { fired: false } };
      invocations.push(invocation);
      observeSignal(invocation);
      return Promise.resolve(produce(invocation)).then(settles(invocation), fails(invocation));
    };
  }

  function observeSignal(invocation) {
    const [signal] = invocation.args;
    if (!(signal instanceof AbortSignal)) return;
    const fired = () => {
      invocation.signal = { fired: true, reason: signal.reason };
    };
    if (signal.aborted) return fired();
    signal.addEventListener('abort', fired);
  }

  function rejects(invocation) {
    return Promise.reject(new Error(`${invocation.component} could not ${invocation.lifecycle}`));
  }

  function onDemand(invocation) {
    invocation.deferral = createDeferral();
    return invocation.deferral.promise;
  }

  function hangs() {
    return new Promise(() => {});
  }

  function settles(invocation) {
    return (value) => {
      invocation.settled = true;
      return value;
    };
  }

  function fails(invocation) {
    return (error) => {
      invocation.settled = true;
      invocation.error = error;
      throw error;
    };
  }

  function releaseStart(name) {
    latest(name, 'start').deferral.resolve();
  }

  function releaseStop(name) {
    latest(name, 'stop').deferral.resolve();
  }

  function failStart(name) {
    latest(name, 'start').deferral.reject(new Error(`${name} could not start`));
  }

  function failStop(name) {
    latest(name, 'stop').deferral.reject(new Error(`${name} could not stop`));
  }

  function abortStart(name) {
    const invocation = latest(name, 'start');
    invocation.deferral.reject(invocation.args[0].reason);
  }

  function isStarting(name) {
    return isInFlight(name, 'start');
  }

  function isStopping(name) {
    return isInFlight(name, 'stop');
  }

  function isInFlight(name, lifecycle) {
    const invocation = latestOrNothing(name, lifecycle);
    return Boolean(invocation) && !invocation.settled;
  }

  function startCount(name) {
    return invocationsOf(name, 'start').length;
  }

  function stopCount(name) {
    return invocationsOf(name, 'stop').length;
  }

  function startError(name) {
    return latest(name, 'start').error;
  }

  function stopError(name) {
    return latest(name, 'stop').error;
  }

  function startArguments(name) {
    return latest(name, 'start').args;
  }

  function stopArguments(name) {
    return latest(name, 'stop').args;
  }

  function startSignal(name) {
    return latest(name, 'start').signal;
  }

  function stopSignal(name) {
    return latest(name, 'stop').signal;
  }

  function sequence(columns) {
    return toStepDataRows(invocations, columns);
  }

  function latest(name, lifecycle) {
    const invocation = latestOrNothing(name, lifecycle);
    if (invocation) return invocation;
    throw new Error(`${name} has no ${lifecycle} invocation to settle`);
  }

  function latestOrNothing(name, lifecycle) {
    return invocationsOf(name, lifecycle).at(-1);
  }

  function invocationsOf(name, lifecycle) {
    return invocations.filter((invocation) => invocation.component === name && invocation.lifecycle === lifecycle);
  }

  return {
    startsWith,
    starts,
    stops,
    startsOnDemand,
    stopsOnDemand,
    hangsWhileStarting,
    hangsWhileStopping,
    failsToStart,
    failsToStop,
    releaseStart,
    releaseStop,
    failStart,
    failStop,
    abortStart,
    isStarting,
    isStopping,
    startCount,
    stopCount,
    startError,
    stopError,
    startArguments,
    stopArguments,
    startSignal,
    stopSignal,
    sequence,
  };
}

function createDeferral() {
  let resolve;
  let reject;
  const promise = new Promise((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

module.exports = { createComponentRecorder };
