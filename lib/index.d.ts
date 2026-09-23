export enum ComponentEvent {
  StartInitiated = 'component_start_initiated',
  StartSucceeded = 'component_start_succeeded',
  StartFailed = 'component_start_failed',
  StartSkipped = 'component_start_skipped',
  StartAborted = 'component_start_aborted',
  StopInitiated = 'component_stop_initiated',
  StopSucceeded = 'component_stop_succeeded',
  StopFailed = 'component_stop_failed',
  StopSkipped = 'component_stop_skipped',
  StopAborted = 'component_stop_aborted',
}

export enum SystemEvent {
  StartInitiated = 'system_start_initiated',
  StartSucceeded = 'system_start_succeeded',
  StartFailed = 'system_start_failed',
  StopInitiated = 'system_stop_initiated',
  StopSucceeded = 'system_stop_succeeded',
  StopFailed = 'system_stop_failed',
}

export type ComponentEventName = `${ComponentEvent}`;

export type SystemEventName = `${SystemEvent}`;

export type SkipReason = 'timeout' | 'abort' | 'failure' | 'missing';

export interface ComponentEventPayload {
  name: string;
  error?: Error;
  reason?: SkipReason;
}

export interface Component {
  name: string;
}

export type StartValues = { [name: string]: unknown };

export interface System {
  on(event: ComponentEventName, listener: (payload: ComponentEventPayload) => void): this;
  on(event: SystemEventName, listener: (error?: Error) => void): this;
  start(): Promise<StartValues>;
  stop(): Promise<void>;
}

export function createSystem(components: readonly Component[]): System;
