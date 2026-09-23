const { documentedEventNames } = require('./event-names');

function createEventRecorder() {
  const recorded = [];

  function record(system) {
    for (const event of documentedEventNames) {
      system.on(event, (payload) => recorded.push({ event, ...payload }));
    }
    return system;
  }

  function trace(columns) {
    return recorded.map((entry) => project(entry, columns));
  }

  return { record, trace };
}

function project(entry, columns) {
  return columns.reduce((row, column) => Object.assign(row, { [column]: asCell(entry[column]) }), {});
}

function asCell(value) {
  return value === undefined ? '' : String(value);
}

module.exports = { createEventRecorder };
