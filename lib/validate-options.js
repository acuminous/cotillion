const { assertTimeout, isPlainObject } = require('./validate-timeout');

const timeoutKeys = ['start', 'stop'];
const optionKeys = ['name', 'timeouts'];

function validateOptions(options) {
  if (options === undefined) return;
  assertObject(options);
  for (const key of Object.keys(options)) assertKnownOption(key);
  assertName(options.name);
  assertTimeout('The system', options.timeouts, timeoutKeys);
}

function assertName(name) {
  if (name === undefined || typeof name === 'string') return;
  throw new Error('The system has a name which is not a string');
}

function assertObject(options) {
  if (isPlainObject(options)) return;
  throw new Error('The options must be an object');
}

function assertKnownOption(key) {
  if (optionKeys.includes(key)) return;
  throw new Error(`The system has an unknown option: ${key}`);
}

module.exports = { validateOptions };
