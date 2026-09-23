const { ComponentEvent, SystemEvent } = require('../../lib');
const { toStepDataRows } = require('./step-data-table');

function createEventRecorder() {
  const recorded = [];

  function record(system) {
    listenFor(system, ComponentEvent, componentColumns);
    listenFor(system, SystemEvent, systemColumns);
    return system;
  }

  function listenFor(system, events, toColumns) {
    for (const event of Object.values(events)) {
      system.on(event, (payload) => recorded.push({ event, payload, columns: toColumns(event, payload) }));
    }
  }

  function trace(columns) {
    return toStepDataRows(recorded.map(columnsOf), columns);
  }

  function payloadOf(event, name) {
    return onlyOne(
      recorded.filter((entry) => entry.event === event && entry.payload?.name === name),
      `${event} events were recorded for ${name}`,
    );
  }

  function errorOf(event) {
    return onlyOne(
      recorded.filter((entry) => entry.event === event),
      `${event} events were recorded`,
    );
  }

  return { record, trace, payloadOf, errorOf };
}

function onlyOne(matches, description) {
  if (matches.length === 1) return matches[0].payload;
  throw new Error(`${matches.length} ${description}`);
}

function columnsOf(entry) {
  return entry.columns;
}

function componentColumns(event, payload) {
  return { event, component: payload.name, reason: payload.reason, payload: Object.keys(payload).join(', ') };
}

function systemColumns(event, error) {
  return { event, payload: error && 'error' };
}

module.exports = { createEventRecorder };
