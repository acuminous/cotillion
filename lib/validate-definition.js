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
  assertTimeout(definition);
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

function assertTimeout(definition) {
  const { timeout } = definition;
  if (timeout === undefined) return;
  if (isPlainObject(timeout)) return assertTimeoutKeys(definition, timeout);
  assertDuration(definition, 'timeout', timeout);
}

function assertTimeoutKeys(definition, timeout) {
  for (const key of Object.keys(timeout)) {
    assertKnownKey(definition, key);
    assertDuration(definition, `${key} timeout`, timeout[key]);
  }
}

function assertKnownKey(definition, key) {
  if (timeoutKeys.includes(key)) return;
  throw new Error(`The component ${definition.name} has an unknown timeout key: ${key}`);
}

function assertDuration(definition, label, value) {
  if (typeof value === 'number' && value > 0) return;
  throw new Error(`The component ${definition.name} has ${article(label)} ${label} which is not a positive number`);
}

function article(noun) {
  return /^[aeiou]/.test(noun) ? 'an' : 'a';
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

module.exports = { validateDefinition };
