const { deepEqual: deq, equal: eq, notEqual: neq, ok } = require('node:assert/strict');
const { setImmediate } = require('node:timers/promises');
const Yadda = require('yadda');
const { createSystem } = require('../../lib');
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

const dictionary = new Dictionary()
  .define('events', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('values', /([\s\S]+)/, async (text) => parseStepDataTable(text))
  .define('component', /(\w+)/)
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
  .given('each component starts on demand', ({ world }) => {
    const recorder = componentRecorderOf(world);
    for (const component of world.components) recorder.startsOnDemand(component);
  })
  .when('the system starts', ({ world }) => {
    trackStart(world, systemOf(world).start());
  })
  .when('the system is started', async ({ world }) => {
    await trackStart(world, systemOf(world).start());
  })
  .when('$component has started', async ({ world }, name) => {
    componentRecorderOf(world).release(name);
    await setImmediate();
  })
  .when('the system is stopped', async ({ world }) => {
    await systemOf(world).stop();
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
  .then('$component has not started', ({ world }, name) => {
    eq(componentRecorderOf(world).startCount(name), 0);
  })
  .then('$component has started $count', ({ world }, name, count) => {
    eq(componentRecorderOf(world).startCount(name), count);
  })
  .then('$component was given an abort signal which has not been aborted', ({ world }, name) => {
    const [signal] = componentRecorderOf(world).startArguments(name);
    ok(signal instanceof AbortSignal, `${name} was not given an abort signal`);
    eq(signal.aborted, false);
  })
  .then('$component was given no other arguments', ({ world }, name) => {
    eq(componentRecorderOf(world).startArguments(name).length, 1);
  })
  .then('the system has started', ({ world }) => {
    ok(lastStart(world).settled, 'the start has not resolved');
  })
  .then('both starts resolve to the same start values', async ({ world }) => {
    const [first, second] = await startValues(world);
    eq(first, second);
  })
  .then('the two starts resolve to different start values', async ({ world }) => {
    const [first, second] = await startValues(world);
    neq(first, second);
  })
  .then('the recorded events are:\n$events', ({ world }, expected) => {
    deq(world.eventRecorder.trace(columnsOf(expected)), expected);
  });

function systemOf(world) {
  world.system ??= world.eventRecorder.record(createSystem(world.components));
  return world.system;
}

function componentRecorderOf(world) {
  world.componentRecorder ??= createComponentRecorder();
  return world.componentRecorder;
}

function trackStart(world, promise) {
  const start = { promise, settled: false };
  promise.then(() => {
    start.settled = true;
  });
  world.starts = (world.starts ?? []).concat(start);
  return promise;
}

function lastStart(world) {
  return world.starts.at(-1);
}

function startValues(world) {
  return Promise.all(world.starts.map((start) => start.promise));
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
