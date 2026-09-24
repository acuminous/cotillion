function schedule(delay, fn) {
  if (delay === undefined) return { clear() {} };
  const timer = setTimeout(fn, delay);
  return { clear: () => clearTimeout(timer) };
}

module.exports = { schedule };
