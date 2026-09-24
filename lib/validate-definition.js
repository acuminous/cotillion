const { assertTimeout } = require('./validate-timeout');

const timeoutKeys = ['start', 'stop', 'abort'];

function validateDefinition(definition) {
  validateEntries(definition, 'definition', new Set());
}

function validateEntries(entries, path, names) {
  assertArray(entries, path);
  entries.forEach((entry, index) => validateEntry(entry, `${path}[${index}]`, names));
}

function validateEntry(entry, path, names) {
  if (Array.isArray(entry)) return validateEntries(entry, path, names);
  validateComponentDefinition(entry, path, names);
}

function validateComponentDefinition(definition, path, names) {
  assertObject(definition, path);
  assertName(definition, path);
  assertUniqueName(definition, names);
  assertLifecycle(definition, 'start');
  assertLifecycle(definition, 'stop');
  assertAbortable(definition);
  assertTimeout(`The component ${definition.name}`, definition.timeout, timeoutKeys);
}

function assertArray(entries, path) {
  if (Array.isArray(entries)) return;
  throw new Error(`The ${path} must be an array`);
}

function assertObject(definition, path) {
  if (definition !== null && typeof definition === 'object') return;
  throw new Error(`The entry at ${path} is not an object`);
}

function assertName(definition, path) {
  if (definition.name === undefined) throw new Error(`The entry at ${path} has no name`);
  if (typeof definition.name === 'string') return;
  throw new Error(`The entry at ${path} has a name which is not a string`);
}

function assertUniqueName(definition, names) {
  if (names.has(definition.name)) throw new Error(`The component name ${definition.name} is used more than once`);
  names.add(definition.name);
}

function assertLifecycle(definition, key) {
  if (definition[key] === undefined) return;
  if (typeof definition[key] === 'function') return;
  throw new Error(`The component ${definition.name} has a ${key} which is not a function`);
}

function assertAbortable(definition) {
  if (definition.abortable === undefined) return;
  if (typeof definition.abortable === 'boolean') return;
  throw new Error(`The component ${definition.name} has an abortable flag which is not a boolean`);
}

module.exports = { validateDefinition };
