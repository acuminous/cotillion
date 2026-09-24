const { equal: eq, ok } = require('node:assert/strict');
const Yadda = require('yadda');
const { createSystem } = require('../../lib');
const { definitionNamed, parseDefinition, parseValue } = require('../lib/definition-notation');

const {
  Dictionary,
  ContextParamLibrary,
  localisation: { English },
} = Yadda;

const dictionary = new Dictionary()
  .define('components', /(.+)/, async (notation) => parseDefinition(notation))
  .define('component', /(\w+)/)
  .define('lifecycle', /(start|stop)/)
  .define('key', /(\w+)/)
  .define('value', /(-?\d+|"[^"]*"|true|false)/, async (token) => parseValue(token))
  .define('message', /"([^"]+)"/);

module.exports = English.localise(new ContextParamLibrary(dictionary))
  .given('the components $components', ({ world }, definition) => {
    world.definition = definition;
  })
  .given('$component has no name', ({ world }, name) => {
    // biome-ignore lint/performance/noDelete: the scenario needs the key absent, not present and undefined
    delete definitionNamed(world.definition, name).name;
  })
  .given('$component is named $value', ({ world }, name, value) => {
    definitionNamed(world.definition, name).name = value;
  })
  .given('$component has a start and a stop', ({ world }, name) => {
    Object.assign(definitionNamed(world.definition, name), { async start() {}, async stop() {} });
  })
  .given('$component has a $lifecycle of $value', ({ world }, name, lifecycle, value) => {
    definitionNamed(world.definition, name)[lifecycle] = value;
  })
  .given('$component has a timeout of $value', ({ world }, name, value) => {
    definitionNamed(world.definition, name).timeout = value;
  })
  .given('$component has an abortable of $value', ({ world }, name, value) => {
    definitionNamed(world.definition, name).abortable = value;
  })
  .given('the system has a timeout of $value', ({ world }, value) => {
    optionsOf(world).timeout = value;
  })
  .given('the system has an? $key timeout of $value', ({ world }, key, value) => {
    optionsOf(world).timeout = { ...optionsOf(world).timeout, [key]: value };
  })
  .given('the system has an option called $key', ({ world }, key) => {
    optionsOf(world)[key] = 1000;
  })
  .given('$component has an? $key timeout of $value', ({ world }, name, key, value) => {
    definitionNamed(world.definition, name).timeout = { [key]: value };
  })
  .when('the system is created', ({ world }) => {
    world.error = errorFrom(() => createSystem(world.definition, world.options));
  })
  .then('the system is accepted', ({ world }) => {
    eq(world.error, undefined);
  })
  .then('the system is rejected with $message', ({ world }, message) => {
    ok(world.error, 'the system was accepted');
    eq(world.error.message, message);
  });

function optionsOf(world) {
  world.options ??= {};
  return world.options;
}

function errorFrom(operation) {
  try {
    operation();
  } catch (error) {
    return error;
  }
}
