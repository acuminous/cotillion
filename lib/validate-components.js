const timeoutKeys = ['start', 'stop', 'abort'];

function validateComponents(components) {
  validateEntries(components, 'components', new Set());
}

function validateEntries(entries, path, names) {
  assertArray(entries, path);
  entries.forEach((entry, index) => validateEntry(entry, `${path}[${index}]`, names));
}

function validateEntry(entry, path, names) {
  if (Array.isArray(entry)) return validateEntries(entry, path, names);
  validateComponent(entry, path, names);
}

function validateComponent(component, path, names) {
  assertObject(component, path);
  assertName(component, path);
  assertUniqueName(component, names);
  assertLifecycle(component, 'start');
  assertLifecycle(component, 'stop');
  assertTimeout(component);
}

function assertArray(entries, path) {
  if (Array.isArray(entries)) return;
  throw new Error(`The ${path} must be an array`);
}

function assertObject(component, path) {
  if (component !== null && typeof component === 'object') return;
  throw new Error(`The entry at ${path} is not an object`);
}

function assertName(component, path) {
  if (component.name === undefined) throw new Error(`The entry at ${path} has no name`);
  if (typeof component.name === 'string') return;
  throw new Error(`The entry at ${path} has a name which is not a string`);
}

function assertUniqueName(component, names) {
  if (names.has(component.name)) throw new Error(`The component name ${component.name} is used more than once`);
  names.add(component.name);
}

function assertLifecycle(component, key) {
  if (component[key] === undefined) return;
  if (typeof component[key] === 'function') return;
  throw new Error(`The component ${component.name} has a ${key} which is not a function`);
}

function assertTimeout(component) {
  const { timeout } = component;
  if (timeout === undefined) return;
  if (isPlainObject(timeout)) return assertTimeoutKeys(component, timeout);
  assertDuration(component, 'timeout', timeout);
}

function assertTimeoutKeys(component, timeout) {
  for (const key of Object.keys(timeout)) {
    assertKnownKey(component, key);
    assertDuration(component, `${key} timeout`, timeout[key]);
  }
}

function assertKnownKey(component, key) {
  if (timeoutKeys.includes(key)) return;
  throw new Error(`The component ${component.name} has an unknown timeout key: ${key}`);
}

function assertDuration(component, label, value) {
  if (typeof value === 'number' && value > 0) return;
  throw new Error(`The component ${component.name} has ${article(label)} ${label} which is not a positive number`);
}

function article(noun) {
  return /^[aeiou]/.test(noun) ? 'an' : 'a';
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

module.exports = { validateComponents };
