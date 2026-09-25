const path = require('node:path');
const Yadda = require('yadda');
const { after } = require('node:test');
const { deepEqual: deq } = require('node:assert/strict');
const creatingASystemLibrary = require('./steps/creating-a-system-library');
const exitingLibrary = require('./steps/exiting-library');
const quickStartLibrary = require('./steps/quick-start-library');
const readmeLibrary = require('./steps/readme-library');
const systemLibrary = require('./steps/system-library');
const { announcedEvents, documentedEvents } = require('./lib/event-recorder');

const {
  FileSearch,
  createInstance,
  parsers: { MarkdownFeatureFileParser },
  plugins: { nodetest },
} = Yadda;

const { featureFile, scenarios, rules, steps } = nodetest.StepLevelPlugin.init({
  parser: new MarkdownFeatureFileParser(),
});

new FileSearch([path.join(__dirname, 'features')], /\.md$/).each((file) => {
  featureFile(file, (feature) => {
    const yadda = createInstance([
      creatingASystemLibrary,
      systemLibrary,
      readmeLibrary,
      quickStartLibrary,
      exitingLibrary,
    ]);
    runScenarios(yadda, feature.scenarios);
    rules(feature.rules, (rule) => runScenarios(yadda, rule.scenarios));
  });
});

after(() => {
  deq(
    [...announcedEvents()].sort(),
    [...documentedEvents()].sort(),
    'an exported event was never announced by any scenario',
  );
});

function runScenarios(yadda, scenarioList) {
  scenarios(scenarioList, (scenario) => {
    const world = {};
    steps(scenario.steps, (step, done) => {
      yadda.run(step, { world }, done);
    });
  });
}
