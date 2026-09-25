const { ComponentEvent, SystemEvent } = require('../../lib');
const { toStepDataRows } = require('./step-data-table');

const documented = new Set([...Object.values(ComponentEvent), ...Object.values(SystemEvent)]);
const announced = new Set();

function createEventRecorder() {
  const recorded = [];
  const awaiting = [];

  function record(system) {
    refuseUndocumentedEvents(system);
    listenFor(system, ComponentEvent, componentColumns);
    listenFor(system, SystemEvent, systemColumns);
    return system;
  }

  function refuseUndocumentedEvents(system) {
    const emit = system.emit.bind(system);
    system.emit = (event, ...args) => {
      if (!documented.has(event)) throw new Error(`The system announced an undocumented event: ${String(event)}`);
      announced.add(event);
      return emit(event, ...args);
    };
  }

  function next(event) {
    return new Promise((resolve) => {
      awaiting.push({ event, resolve });
    });
  }

  function announce(event) {
    for (const waiter of awaiting.splice(0)) {
      if (waiter.event === event) waiter.resolve();
      else awaiting.push(waiter);
    }
  }

  function listenFor(system, events, toColumns) {
    for (const event of Object.values(events)) {
      system.on(event, (payload) => {
        recorded.push({ event, payload, columns: toColumns(event, payload) });
        announce(event);
      });
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
    ).error;
  }

  function systemNames() {
    return new Set(recorded.filter((entry) => entry.event.startsWith('system_')).map((entry) => entry.payload.name));
  }

  return { record, trace, payloadOf, errorOf, systemNames, next };
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

function systemColumns(event, payload) {
  return { event, payload: Object.keys(payload).join(', ') };
}

function announcedEvents() {
  return announced;
}

function documentedEvents() {
  return documented;
}

module.exports = { createEventRecorder, announcedEvents, documentedEvents };
