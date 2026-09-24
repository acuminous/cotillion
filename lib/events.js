const ComponentEvent = Object.freeze({
  StartInitiated: 'component_start_initiated',
  StartSucceeded: 'component_start_succeeded',
  StartFailed: 'component_start_failed',
  StartSkipped: 'component_start_skipped',
  StartAborted: 'component_start_aborted',
  StopInitiated: 'component_stop_initiated',
  StopSucceeded: 'component_stop_succeeded',
  StopFailed: 'component_stop_failed',
  StopSkipped: 'component_stop_skipped',
});

const SystemEvent = Object.freeze({
  StartInitiated: 'system_start_initiated',
  StartSucceeded: 'system_start_succeeded',
  StartFailed: 'system_start_failed',
  StopInitiated: 'system_stop_initiated',
  StopSucceeded: 'system_stop_succeeded',
  StopFailed: 'system_stop_failed',
});

const SkipReason = Object.freeze({
  Timeout: 'timeout',
  Abort: 'abort',
  Failure: 'failure',
  Missing: 'missing',
  Started: 'started',
  Stopped: 'stopped',
});

module.exports = { ComponentEvent, SystemEvent, SkipReason };
