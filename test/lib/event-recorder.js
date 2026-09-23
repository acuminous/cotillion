const { ComponentEvent, SystemEvent } = require('../../lib');
const { toStepDataRows } = require('./step-data-table');

const documentedEventNames = Object.values(ComponentEvent).concat(Object.values(SystemEvent));

function createEventRecorder() {
  const recorded = [];

  function record(system) {
    for (const event of documentedEventNames) {
      system.on(event, (payload) => recorded.push({ event, payload }));
    }
    return system;
  }

  function trace(columns) {
    return toStepDataRows(recorded.map(toColumns), columns);
  }

  function payloadOf(event, name) {
    const matches = recorded.filter((entry) => entry.event === event && entry.payload?.name === name);
    if (matches.length === 1) return matches[0].payload;
    throw new Error(`${matches.length} ${event} events were recorded for ${name}`);
  }

  return { record, trace, payloadOf };
}

function toColumns({ event, payload }) {
  return { event, component: payload?.name, reason: payload?.reason, payload: propertiesOf(payload) };
}

function propertiesOf(payload) {
  return payload && Object.keys(payload).join(', ');
}

module.exports = { createEventRecorder };
