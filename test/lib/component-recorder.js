function createComponentRecorder() {
  const invocations = [];
  const deferrals = new Map();

  function startsWith(component, value) {
    recordStarts(component, () => value);
  }

  function startsOnDemand(component) {
    deferrals.set(component.name, createDeferral());
    recordStarts(component, () => deferrals.get(component.name).promise);
  }

  function recordStarts(component, produce) {
    component.start = (...args) => {
      const invocation = { name: component.name, args, settled: false };
      invocations.push(invocation);
      return Promise.resolve(produce()).then(settle(invocation));
    };
  }

  function settle(invocation) {
    return (value) => {
      invocation.settled = true;
      return value;
    };
  }

  function release(name) {
    deferrals.get(name).resolve();
  }

  function isStarting(name) {
    const invocation = invocationsOf(name).at(-1);
    return Boolean(invocation) && !invocation.settled;
  }

  function startCount(name) {
    return invocationsOf(name).length;
  }

  function startArguments(name) {
    return invocationsOf(name).at(-1).args;
  }

  function invocationsOf(name) {
    return invocations.filter((invocation) => invocation.name === name);
  }

  return { startsWith, startsOnDemand, release, isStarting, startCount, startArguments };
}

function createDeferral() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

module.exports = { createComponentRecorder };
