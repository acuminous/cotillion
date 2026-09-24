function validateEvents(events) {
  if (events.length === 0) throw new Error('The system must be given at least one process event to stop on');
  for (const event of events) assertString(event);
}

function assertString(event) {
  if (typeof event === 'string') return;
  throw new Error('The system has a process event which is not a string');
}

module.exports = { validateEvents };
