const { deepEqual: deq, equal: eq, notEqual: neq, ok } = require('node:assert/strict');
const { setImmediate } = require('node:timers/promises');
const Yadda = require('yadda');
const { ComponentEvent, SystemEvent, createSystem } = require('../../lib');
const { componentNamed } = require('../lib/component-notation');
const { createComponentRecorder } = require('../lib/component-recorder');
const { createEventRecorder } = require('../lib/event-recorder');
const { parseStepDataTable } = require('../lib/step-data-table');

const {
  Dictionary,
  ContextParamLibrary,
  localisation: { English },
} = Yadda;

const counts = { once: 1, twice: 2 };

const argumentsOf = {
  start: (recorder, name) => recorder.startArguments(name),
  stop: (recorder, name) => recorder.stopArguments(name),
};

const componentErrorOf = {
  start: (recorder, name) => recorder.startError(name),
  stop: (recorder, name) => recorder.stopError(name),
};

const failedEventOf = {
  component: { start: ComponentEvent.StartFailed, stop: ComponentEvent.StopFailed },
  system: { start: SystemEvent.StartFailed, stop: SystemEvent.StopFailed },
};

const announcedErrorOf = {
  component: (recorder, event, name) => recorder.payloadOf(event, name).error,
  system: (recorder, event) => recorder.errorOf(event),
};

const lastOperationOf = {
  start: lastStart,
  stop: lastStop,
};

const dictionary = new Dictionary()
  .define('events', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('values', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('invocations', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('component', /(\w+)/)
  .define('lifecycle', /(start|stop)/)
  .define('scope', /(component|system)/)
  .define('value', /(.+)/)
  .define('count', /(once|twice)/, async (word) => counts[word]);

module.exports = English.localise(new ContextParamLibrary(dictionary))
  .given("the system's events are recorded", ({ world }) => {
    world.eventRecorder = createEventRecorder();
  })
  .given('a system with no components', ({ world }) => {
    world.components = [];
  })
  .given('$component starts with $value', ({ world }, name, value) => {
    componentRecorderOf(world).startsWith(componentNamed(world.components, name), value);
  })
  .given('$component starts without returning a value', ({ world }, name) => {
    componentRecorderOf(world).startsWith(componentNamed(world.components, name), undefined);
  })
  .given('$component has no start function', ({ world }, name) => {
    // biome-ignore lint/performance/noDelete: the scenario needs the key absent, not present and undefined
    delete componentNamed(world.components, name).start;
  })
  .given('$component has no stop function', ({ world }, name) => {
    // biome-ignore lint/performance/noDelete: the scenario needs the key absent, not present and undefined
    delete componentNamed(world.components, name).stop;
  })
  .given('each component starts', ({ world }) => {
    eachComponent(world, (recorder, component) => recorder.starts(component));
  })
  .given('each component stops', ({ world }) => {
    eachComponent(world, (recorder, component) => recorder.stops(component));
  })
  .given('each component starts on demand', ({ world }) => {
    eachComponent(world, (recorder, component) => recorder.startsOnDemand(component));
  })
  .given('each component stops on demand', ({ world }) => {
    eachComponent(world, (recorder, component) => recorder.stopsOnDemand(component));
  })
  .given('$component fails to start', ({ world }, name) => {
    componentRecorderOf(world).failsToStart(componentNamed(world.components, name));
  })
  .given('$component fails to stop', ({ world }, name) => {
    componentRecorderOf(world).failsToStop(componentNamed(world.components, name));
  })
  .when('the system starts', ({ world }) => {
    trackStart(world, systemOf(world).start());
  })
  .when('the system is started', async ({ world }) => {
    await trackStart(world, systemOf(world).start());
  })
  .when('the system stops', ({ world }) => {
    trackStop(world, systemOf(world).stop());
  })
  .when('the system is stopped', async ({ world }) => {
    await trackStop(world, systemOf(world).stop());
  })
  .when('the system is restarted', async ({ world }) => {
    await trackStart(world, systemOf(world).restart());
  })
  .when('$component has started', async ({ world }, name) => {
    componentRecorderOf(world).releaseStart(name);
    await setImmediate();
  })
  .when('$component has stopped', async ({ world }, name) => {
    componentRecorderOf(world).releaseStop(name);
    await setImmediate();
  })
  .when('$component has failed to stop', async ({ world }, name) => {
    componentRecorderOf(world).failStop(name);
    await setImmediate();
  })
  .then('the start values are empty', async ({ world }) => {
    deq(await lastStart(world).promise, {});
  })
  .then('the start values are:\n$values', async ({ world }, rows) => {
    deq(await lastStart(world).promise, toStartValues(rows));
  })
  .then('$component is starting', ({ world }, name) => {
    ok(componentRecorderOf(world).isStarting(name), `${name} is not starting`);
  })
  .then('$component is stopping', ({ world }, name) => {
    ok(componentRecorderOf(world).isStopping(name), `${name} is not stopping`);
  })
  .then('$component has not started', ({ world }, name) => {
    eq(componentRecorderOf(world).startCount(name), 0);
  })
  .then('$component has not stopped', ({ world }, name) => {
    eq(componentRecorderOf(world).stopCount(name), 0);
  })
  .then('$component has started $count', ({ world }, name, count) => {
    eq(componentRecorderOf(world).startCount(name), count);
  })
  .then('$component has stopped $count', ({ world }, name, count) => {
    eq(componentRecorderOf(world).stopCount(name), count);
  })
  .then(
    "$component's $lifecycle was given an abort signal which has not been aborted",
    ({ world }, name, lifecycle) => {
      const [signal] = argumentsOf[lifecycle](componentRecorderOf(world), name);
      ok(signal instanceof AbortSignal, `${name} was not given an abort signal`);
      eq(signal.aborted, false);
    },
  )
  .then("$component's $lifecycle was given no other arguments", ({ world }, name, lifecycle) => {
    eq(argumentsOf[lifecycle](componentRecorderOf(world), name).length, 1);
  })
  .then('the system has started', ({ world }) => {
    ok(lastStart(world).settled, 'the start has not resolved');
  })
  .then('the system has stopped', ({ world }) => {
    ok(lastStop(world).settled, 'the stop has not resolved');
  })
  .then("the $lifecycle is rejected with $component's error", async ({ world }, lifecycle, name) => {
    const error = await rejectionOf(lastOperationOf[lifecycle](world));
    eq(error, componentErrorOf[lifecycle](componentRecorderOf(world), name));
  })
  .then("the failed $scope $lifecycle event carries $component's error", ({ world }, scope, lifecycle, name) => {
    const announced = announcedErrorOf[scope](world.eventRecorder, failedEventOf[scope][lifecycle], name);
    eq(announced, componentErrorOf[lifecycle](componentRecorderOf(world), name));
  })
  .then('both starts resolve to the same start values', async ({ world }) => {
    const [first, second] = await settlementsOf(world.starts);
    eq(first, second);
  })
  .then('the two starts resolve to different start values', async ({ world }) => {
    const [first, second] = await settlementsOf(world.starts);
    neq(first, second);
  })
  .then('both stops resolve', async ({ world }) => {
    await settlementsOf(world.stops);
    ok(world.stops.every(hasSettled), 'a stop has not resolved');
  })
  .then('the recorded events are:\n$events', ({ world }, expected) => {
    deq(world.eventRecorder.trace(columnsOf(expected)), expected);
  })
  .then('the recorded invocations are:\n$invocations', ({ world }, expected) => {
    deq(componentRecorderOf(world).sequence(columnsOf(expected)), expected);
  });

function systemOf(world) {
  world.system ??= recordEvents(world, createSystem(world.components));
  return world.system;
}

function recordEvents(world, system) {
  return world.eventRecorder?.record(system) ?? system;
}

function componentRecorderOf(world) {
  world.componentRecorder ??= createComponentRecorder();
  return world.componentRecorder;
}

function eachComponent(world, apply) {
  const recorder = componentRecorderOf(world);
  for (const component of world.components) apply(recorder, component);
}

function trackStart(world, promise) {
  return track(world, 'starts', promise);
}

function trackStop(world, promise) {
  return track(world, 'stops', promise);
}

function track(world, key, promise) {
  const operation = { promise, settled: false };
  promise.then(settles(operation), settles(operation));
  world[key] = (world[key] ?? []).concat(operation);
  return promise;
}

function settles(operation) {
  return () => {
    operation.settled = true;
  };
}

function lastStart(world) {
  return world.starts.at(-1);
}

function lastStop(world) {
  return world.stops.at(-1);
}

function rejectionOf(operation) {
  return operation.promise.then(refuseResolution, (error) => error);
}

function refuseResolution() {
  throw new Error('the operation resolved instead of rejecting');
}

function hasSettled(operation) {
  return operation.settled;
}

function settlementsOf(operations) {
  return Promise.all(operations.map((operation) => operation.promise));
}

function toStartValues(rows) {
  return rows.reduce((values, row) => Object.assign(values, { [row.component]: cellValue(row) }), {});
}

function cellValue(row) {
  return row.value === '' ? undefined : row.value;
}

function columnsOf(rows) {
  return Object.keys(rows[0]);
}
