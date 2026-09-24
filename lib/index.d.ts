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

export type SkipReason = 'timeout' | 'abort' | 'failure' | 'missing' | 'started' | 'stopped';

export interface ComponentEventPayload {
  name: string;
  error?: Error;
  reason?: SkipReason;
}

export interface Timeouts {
  start?: number;
  stop?: number;
}

export interface ComponentDefinition {
  name: string;
  abortable?: boolean;
  start?: (signal: AbortSignal) => unknown;
  stop?: () => unknown;
  timeout?: number | Timeouts;
}

export interface SystemOptions {
  timeout?: number | Timeouts;
}

export type SystemDefinition = readonly (ComponentDefinition | SystemDefinition)[];

export type Components = { [name: string]: unknown };

export interface System {
  on(event: ComponentEventName, listener: (payload: ComponentEventPayload) => void): this;
  on(event: SystemEventName, listener: (error?: Error) => void): this;
  start(): Promise<Components>;
  stop(): Promise<void>;
  restart(): Promise<Components>;
}

export class TimeoutError extends Error {
  readonly name: 'TimeoutError';
}

export class AbortError extends Error {
  readonly name: 'AbortError';
}

export function createSystem(definition: SystemDefinition, options?: SystemOptions): System;
