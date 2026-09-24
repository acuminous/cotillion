const { assertTimeout, isPlainObject } = require('./validate-timeout');

const timeoutKeys = ['start', 'stop'];
const optionKeys = ['timeout'];

function validateOptions(options) {
  if (options === undefined) return;
  assertObject(options);
  for (const key of Object.keys(options)) assertKnownOption(key);
  assertTimeout('The system', options.timeout, timeoutKeys);
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
