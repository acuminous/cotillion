function assertTimeout(subject, timeout, keys) {
  if (timeout === undefined) return;
  if (isPlainObject(timeout)) return assertTimeoutKeys(subject, timeout, keys);
  assertDuration(subject, 'timeout', timeout);
}

function assertTimeoutKeys(subject, timeout, keys) {
  for (const key of Object.keys(timeout)) {
    assertKnownKey(subject, key, keys);
    assertDuration(subject, `${key} timeout`, timeout[key]);
  }
}

function assertKnownKey(subject, key, keys) {
  if (keys.includes(key)) return;
  throw new Error(`${subject} has an unknown timeout key: ${key}`);
}

function assertDuration(subject, label, value) {
  if (typeof value === 'number' && value > 0) return;
  throw new Error(`${subject} has ${article(label)} ${label} which is not a positive number`);
}

function article(noun) {
  return /^[aeiou]/.test(noun) ? 'an' : 'a';
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

module.exports = { assertTimeout, isPlainObject };
