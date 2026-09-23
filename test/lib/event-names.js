const componentEventNames = [
  'component_start_initiated',
  'component_start_succeeded',
  'component_start_failed',
  'component_start_skipped',
  'component_start_aborted',
  'component_stop_initiated',
  'component_stop_succeeded',
  'component_stop_failed',
  'component_stop_skipped',
  'component_stop_aborted',
];

const systemEventNames = [
  'system_start_initiated',
  'system_start_succeeded',
  'system_start_failed',
  'system_stop_initiated',
  'system_stop_succeeded',
  'system_stop_failed',
];

const documentedEventNames = componentEventNames.concat(systemEventNames);

module.exports = { componentEventNames, systemEventNames, documentedEventNames };
