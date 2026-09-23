const path = require('node:path');
const Yadda = require('yadda');
const systemLibrary = require('./steps/system-library');

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
    const yadda = createInstance(systemLibrary);
    runScenarios(yadda, feature.scenarios);
    rules(feature.rules, (rule) => runScenarios(yadda, rule.scenarios));
  });
});

function runScenarios(yadda, scenarioList) {
  scenarios(scenarioList, (scenario) => {
    const world = {};
    steps(scenario.steps, (step, done) => {
      yadda.run(step, { world }, done);
    });
  });
}
