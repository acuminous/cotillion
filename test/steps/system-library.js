const { deepEqual: deq, equal: eq, notEqual: neq, ok } = require('node:assert/strict');
const { setImmediate } = require('node:timers/promises');
const Yadda = require('yadda');
const { AbortError, ComponentEvent, SystemEvent, TimeoutError, createSystem } = require('../../lib');
const { definitionNamed } = require('../lib/definition-notation');
const { createComponentRecorder } = require('../lib/component-recorder');
const { createEventRecorder } = require('../lib/event-recorder');
const { parseStepDataTable } = require('../lib/step-data-table');

const {
  Dictionary,
  ContextParamLibrary,
  localisation: { English },
} = Yadda;

const counts = { once: 1, twice: 2 };

const errorTypes = { 'a TimeoutError': TimeoutError, 'an AbortError': AbortError, 'an AggregateError': AggregateError };

const activities = { starting: 'start', stopping: 'stop' };

const hangsWhile = {
  start: (recorder, entry) => recorder.hangsWhileStarting(entry),
  stop: (recorder, entry) => recorder.hangsWhileStopping(entry),
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
  restart: lastStart,
};

const dictionary = new Dictionary()
  .define('events', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('started', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('invocations', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('component', /(\w+)/)
  .define('lifecycle', /(start|stop)/)
  .define('operation', /(start|stop|restart)/)
  .define('activity', /(starting|stopping)/, async (word) => activities[word])
  .define('scope', /(component|system)/)
  .define('value', /(.+)/)
  .define('count', /(once|twice)/, async (word) => counts[word])
  .define('timeout', /(\d+)ms/, async (digits) => Number(digits))
  .define('error', /(a TimeoutError|an AbortError|an AggregateError)/, async (phrase) => errorTypes[phrase])
  .define('message', /"([^"]+)"/)
  .define('processEvents', /(.+)/, async (text) => text.split(', '))
  .define('names', /(.+)/, async (text) => text.split(', '))
  .define('processEvent', /(\w+)/);

module.exports = English.localise(new ContextParamLibrary(dictionary))
  .given("the system's events are recorded", ({ world }) => {
    world.eventRecorder = createEventRecorder();
  })
  .given('a system with no components', ({ world }) => {
    world.definition = [];
  })
  .given('the system has a timeout of $timeout', ({ world }, timeout) => {
    optionsOf(world).timeouts = timeout;
  })
  .given('the system has a start timeout of $timeout', ({ world }, timeout) => {
    optionsOf(world).timeouts = { ...optionsOf(world).timeouts, start: timeout };
  })
  .given('the system has a stop timeout of $timeout', ({ world }, timeout) => {
    optionsOf(world).timeouts = { ...optionsOf(world).timeouts, stop: timeout };
  })
  .given('$component starts with $value', ({ world }, name, value) => {
    componentRecorderOf(world).startsWith(definitionNamed(world.definition, name), value);
  })
  .given('$component starts without returning anything', ({ world }, name) => {
    componentRecorderOf(world).startsWith(definitionNamed(world.definition, name), undefined);
  })
  .given('$component has no start function', ({ world }, name) => {
    // biome-ignore lint/performance/noDelete: the scenario needs the key absent, not present and undefined
    delete definitionNamed(world.definition, name).start;
  })
  .given('$component has no stop function', ({ world }, name) => {
    // biome-ignore lint/performance/noDelete: the scenario needs the key absent, not present and undefined
    delete definitionNamed(world.definition, name).stop;
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
  .given('$component starts on demand', ({ world }, name) => {
    componentRecorderOf(world).startsOnDemand(definitionNamed(world.definition, name));
  })
  .given('$component stops on demand', ({ world }, name) => {
    componentRecorderOf(world).stopsOnDemand(definitionNamed(world.definition, name));
  })
  .given('$component fails to start', ({ world }, name) => {
    componentRecorderOf(world).failsToStart(definitionNamed(world.definition, name));
  })
  .given('$component fails to stop', ({ world }, name) => {
    componentRecorderOf(world).failsToStop(definitionNamed(world.definition, name));
  })
  .given('$component hangs while $activity', ({ world }, name, lifecycle) => {
    hangsWhile[lifecycle](componentRecorderOf(world), definitionNamed(world.definition, name));
  })
  .given('$component has a timeout of $timeout', ({ world }, name, timeout) => {
    definitionNamed(world.definition, name).timeouts = timeout;
  })
  .given('$component has a $lifecycle timeout of $timeout', ({ world }, name, lifecycle, timeout) => {
    const entry = definitionNamed(world.definition, name);
    entry.timeouts = { ...entry.timeouts, [lifecycle]: timeout };
  })
  .given('$component is abortable', ({ world }, name) => {
    definitionNamed(world.definition, name).abortable = true;
  })
  .given('the system is stopped as soon as $component has started', ({ world }, name) => {
    stopWhen(world, ComponentEvent.StartSucceeded, name);
  })
  .given("the system is stopped as soon as $component's start is initiated", ({ world }, name) => {
    stopWhen(world, ComponentEvent.StartInitiated, name);
  })
  .given('the system stops on the process events $processEvents', ({ world }, events) => {
    stopOnProcessEvents(world, events);
  })
  .when('the process emits $processEvent', async ({ world }, event) => {
    process.emit(event);
    await setImmediate();
  })
  .when('the process events are unbound', ({ world }) => {
    for (const unbind of world.unbinders) unbind();
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
  .when('the system restarts', ({ world }) => {
    trackStart(world, systemOf(world).restart());
  })
  .when('the timeout has expired', async ({ world }) => {
    await world.eventRecorder.next(SystemEvent.StopInitiated);
    await setImmediate();
  })
  .when('$component has started', async ({ world }, name) => {
    componentRecorderOf(world).releaseStart(name);
    await setImmediate();
  })
  .when('$component has stopped', async ({ world }, name) => {
    componentRecorderOf(world).releaseStop(name);
    await setImmediate();
  })
  .when('$component has failed to start', async ({ world }, name) => {
    componentRecorderOf(world).failStart(name);
    await setImmediate();
  })
  .when('$component has failed to stop', async ({ world }, name) => {
    componentRecorderOf(world).failStop(name);
    await setImmediate();
  })
  .when('$component has aborted', async ({ world }, name) => {
    componentRecorderOf(world).abortStart(name);
    await setImmediate();
  })
  .then('there are no components', async ({ world }) => {
    deq(await lastStart(world).promise, {});
  })
  .then('the components are:\n$started', async ({ world }, rows) => {
    deq(await lastStart(world).promise, toComponents(rows));
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
  .then("$component's start was given an abort signal which has not fired", ({ world }, name) => {
    const [, signal] = componentRecorderOf(world).startArguments(name);
    ok(signal instanceof AbortSignal, `${name} was not given an abort signal`);
    eq(componentRecorderOf(world).startSignal(name).fired, false, `${name}'s start signal fired`);
  })
  .then("$component's start was given an abort signal which has fired with that error", ({ world }, name) => {
    const [, signal] = componentRecorderOf(world).startArguments(name);
    ok(signal instanceof AbortSignal, `${name} was not given an abort signal`);
    const { fired, reason } = componentRecorderOf(world).startSignal(name);
    ok(fired, `${name}'s start signal did not fire`);
    eq(reason, world.rejection);
  })
  .then(
    "$component's start was given an abort signal which has fired with $error $message",
    ({ world }, name, errorType, message) => {
      const { fired, reason } = componentRecorderOf(world).startSignal(name);
      ok(fired, `${name}'s start signal did not fire`);
      ok(reason instanceof errorType, `the signal fired with ${reason?.constructor?.name}: ${reason?.message}`);
      eq(reason.message, message);
    },
  )
  .then("$component's start was given no components", ({ world }, name) => {
    deq(componentRecorderOf(world).startComponents(name), {});
  })
  .then("$component's start was given the components:\n$started", ({ world }, name, rows) => {
    deq(componentRecorderOf(world).startComponents(name), toComponents(rows));
  })
  .then("the components given to $component's start are frozen", ({ world }, name) => {
    ok(Object.isFrozen(componentRecorderOf(world).startComponents(name)), `${name}'s components can be changed`);
  })
  .then("$component's start was given no other arguments", ({ world }, name) => {
    eq(componentRecorderOf(world).startArguments(name).length, 2);
  })
  .then("$component's stop was given no arguments", ({ world }, name) => {
    eq(componentRecorderOf(world).stopArguments(name).length, 0);
  })
  .then('the system has started', ({ world }) => {
    ok(lastStart(world).settled, 'the start has not resolved');
  })
  .then('the system has stopped', ({ world }) => {
    ok(lastStop(world).settled, 'the stop has not resolved');
  })
  .then('the $operation is still in progress', ({ world }, operation) => {
    ok(!lastOperationOf[operation](world).settled, `the ${operation} has settled`);
  })
  .then("the $lifecycle is rejected with $component's error", async ({ world }, lifecycle, name) => {
    const error = await rejectionOf(world, lifecycle);
    eq(error, componentErrorOf[lifecycle](componentRecorderOf(world), name));
  })
  .then('the $operation was rejected once the system had stopped', ({ world }, operation) => {
    ok(hadStopped(world.eventsAtRejection), `the ${operation} was rejected before the system had stopped`);
  })
  .then(
    "$component's failed $lifecycle event carries $error $message",
    ({ world }, name, lifecycle, errorType, message) => {
      const error = world.eventRecorder.payloadOf(failedEventOf.component[lifecycle], name).error;
      ok(error instanceof errorType, `the event carried ${error?.constructor?.name}: ${error?.message}`);
      eq(error.message, message);
    },
  )
  .then("$component's failed $lifecycle event carries that error", ({ world }, name, lifecycle) => {
    eq(world.eventRecorder.payloadOf(failedEventOf.component[lifecycle], name).error, world.rejection);
  })
  .then('the failed system $lifecycle event carries $error $message', ({ world }, lifecycle, errorType, message) => {
    const error = world.eventRecorder.errorOf(failedEventOf.system[lifecycle]);
    ok(error instanceof errorType, `the event carried ${error?.constructor?.name}: ${error?.message}`);
    eq(error.message, message);
  })
  .then("the failed $scope $lifecycle event carries $component's error", ({ world }, scope, lifecycle, name) => {
    const announced = announcedErrorOf[scope](world.eventRecorder, failedEventOf[scope][lifecycle], name);
    eq(announced, componentErrorOf[lifecycle](componentRecorderOf(world), name));
  })
  .then('the $operation is rejected with $error $message', async ({ world }, operation, errorType, message) => {
    const error = await rejectionOf(world, operation);
    ok(error instanceof errorType, `the ${operation} was rejected with ${error.constructor.name}: ${error.message}`);
    eq(error.message, message);
  })
  .then('that error contains the errors of $names', ({ world }, names) => {
    const recorder = componentRecorderOf(world);
    deq(
      world.rejection.errors,
      names.map((name) => componentErrorOf[world.rejectedOperation](recorder, name)),
    );
  })
  .then('the failed system $lifecycle event carries that error', ({ world }, lifecycle) => {
    eq(world.eventRecorder.errorOf(failedEventOf.system[lifecycle]), world.rejection);
  })
  .then('both starts resolve to the same components', async ({ world }) => {
    const [first, second] = await settlementsOf(world.starts);
    eq(first, second);
  })
  .then('the two starts resolve to different components', async ({ world }) => {
    const [first, second] = await settlementsOf(world.starts);
    neq(first, second);
  })
  .then('both stops resolve', async ({ world }) => {
    await settlementsOf(world.stops);
    ok(world.stops.every(hasSettled), 'a stop has not resolved');
  })
  .then('the process has no listeners for $processEvent', (_, event) => {
    eq(process.listenerCount(event), 0);
  })
  .then('the recorded events are:\n$events', ({ world }, expected) => {
    deq(world.eventRecorder.trace(columnsOf(expected)), expected);
  })
  .then('the recorded invocations are:\n$invocations', ({ world }, expected) => {
    deq(componentRecorderOf(world).sequence(columnsOf(expected)), expected);
  });

let boundElsewhere = [];

function stopOnProcessEvents(world, events) {
  if (world.unbinders === undefined) {
    for (const unbind of boundElsewhere) unbind();
    world.unbinders = [];
    boundElsewhere = world.unbinders;
  }
  world.unbinders.push(systemOf(world).stopOn(...events));
}

function stopWhen(world, event, name) {
  systemOf(world).on(event, (payload) => {
    if (payload.name === name) trackStop(world, systemOf(world).stop());
  });
}

function hadStopped(events) {
  return events.some((entry) => entry.event === SystemEvent.StopSucceeded || entry.event === SystemEvent.StopFailed);
}

function systemOf(world) {
  world.system ??= recordEvents(world, createSystem(world.definition, world.options));
  return world.system;
}

function optionsOf(world) {
  if (world.system) throw new Error('the system has already been created, so its options can no longer change');
  world.options ??= {};
  return world.options;
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
  for (const entry of world.definition.flat(Number.POSITIVE_INFINITY)) apply(recorder, entry);
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

async function rejectionOf(world, operation) {
  world.rejectedOperation = operation;
  world.rejection = await lastOperationOf[operation](world).promise.then(refuseResolution, (error) => error);
  world.eventsAtRejection = world.eventRecorder?.trace(['event']) ?? [];
  return world.rejection;
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

function toComponents(rows) {
  return rows.reduce((components, row) => Object.assign(components, { [row.name]: cellComponent(row) }), {});
}

function cellComponent(row) {
  return row.component === '' ? undefined : row.component;
}

function columnsOf(rows) {
  return Object.keys(rows[0]);
}
