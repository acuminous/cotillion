const { ComponentEvent, SystemEvent } = require('../../lib');
const { toStepDataRows } = require('./step-data-table');

const documentedEventNames = Object.values(ComponentEvent).concat(Object.values(SystemEvent));

function createEventRecorder() {
  const recorded = [];

  function record(system) {
    for (const event of documentedEventNames) {
      system.on(event, (payload) => recorded.push({ event, ...payload }));
    }
    return system;
  }

  function trace(columns) {
    return toStepDataRows(recorded, columns);
  }

  return { record, trace };
}

module.exports = { createEventRecorder };
