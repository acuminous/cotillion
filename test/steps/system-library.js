const { deepEqual: deq } = require('node:assert/strict');
const Yadda = require('yadda');
const { createSystem } = require('../../lib');
const { createEventRecorder } = require('../lib/event-recorder');
const { parseStepDataTable } = require('../lib/step-data-table');

const {
  Dictionary,
  ContextParamLibrary,
  localisation: { English },
} = Yadda;

const dictionary = new Dictionary().define('events', /([\s\S]+)/, async (text) => parseStepDataTable(text));

module.exports = English.localise(new ContextParamLibrary(dictionary))
  .given("the system's events are recorded", ({ world }) => {
    world.recorder = createEventRecorder();
  })
  .given('a system with no components', ({ world }) => {
    world.system = world.recorder.record(createSystem([]));
  })
  .when('the system is started', async ({ world }) => {
    world.startValues = await world.system.start();
  })
  .then('the start values are empty', ({ world }) => {
    deq(world.startValues, {});
  })
  .when('the system is stopped', async ({ world }) => {
    await world.system.stop();
  })
  .then('the recorded events are:\n$events', ({ world }, expected) => {
    deq(world.recorder.trace(columnsOf(expected)), expected);
  });

function columnsOf(rows) {
  return Object.keys(rows[0]);
}
