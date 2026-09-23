const { toStepDataRows } = require('./step-data-table');

function createComponentRecorder() {
  const invocations = [];

  function startsWith(component, value) {
    records(component, 'start', () => value);
  }

  function starts(component) {
    records(component, 'start', () => undefined);
  }

  function stops(component) {
    records(component, 'stop', () => undefined);
  }

  function startsOnDemand(component) {
    records(component, 'start', onDemand);
  }

  function stopsOnDemand(component) {
    records(component, 'stop', onDemand);
  }

  function records(component, lifecycle, produce) {
    component[lifecycle] = (...args) => {
      const invocation = { component: component.name, lifecycle, args, settled: false };
      invocations.push(invocation);
      return Promise.resolve(produce(invocation)).then(settles(invocation), fails(invocation));
    };
  }

  function onDemand(invocation) {
    invocation.deferral = createDeferral();
    return invocation.deferral.promise;
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
      throw error;
    };
  }

  function releaseStart(name) {
    latest(name, 'start').deferral.resolve();
  }

  function releaseStop(name) {
    latest(name, 'stop').deferral.resolve();
  }

  function failStop(name) {
    latest(name, 'stop').deferral.reject(new Error(`${name} could not stop`));
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

  function startArguments(name) {
    return latest(name, 'start').args;
  }

  function stopArguments(name) {
    return latest(name, 'stop').args;
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
    releaseStart,
    releaseStop,
    failStop,
    isStarting,
    isStopping,
    startCount,
    stopCount,
    startArguments,
    stopArguments,
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
