import type { EventEmitter } from 'node:events';

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

export type InterruptionReason = 'timeout' | 'abort';

export interface ComponentEventPayloads {
  component_start_initiated: { name: string };
  component_start_succeeded: { name: string };
  component_start_failed: { name: string; error: Error };
  component_start_skipped: { name: string; reason: SkipReason };
  component_start_aborted: { name: string; reason: InterruptionReason };
  component_stop_initiated: { name: string };
  component_stop_succeeded: { name: string };
  component_stop_failed: { name: string; error: Error };
  component_stop_skipped: { name: string; reason: SkipReason };
}

export interface SystemEventArguments {
  system_start_initiated: [];
  system_start_succeeded: [];
  system_start_failed: [error: Error];
  system_stop_initiated: [];
  system_stop_succeeded: [];
  system_stop_failed: [error: Error];
}

export type ComponentEventPayload = ComponentEventPayloads[ComponentEventName];

export interface Timeouts {
  start?: number;
  stop?: number;
}

export type Components = { [name: string]: unknown };

export interface ComponentDefinition {
  name: string;
  abortable?: boolean;
  start?(components: Components, signal: AbortSignal): unknown;
  stop?(): unknown;
  timeout?: number | Timeouts;
  [extra: string]: unknown;
}

export type SystemDefinition = readonly (ComponentDefinition | SystemDefinition)[];

export interface SystemOptions {
  timeouts?: number | Timeouts;
}

type LeavesOf<D> = D extends readonly (infer E)[] ? (E extends readonly unknown[] ? LeavesOf<E> : E) : never;

type NameOf<L> = L extends { name: infer N extends string } ? N : never;

// biome-ignore lint/suspicious/noConfusingVoidType: a start which returns nothing resolves to void, and the README promises undefined
type Produced<R> = [Awaited<R>] extends [void] ? undefined : Awaited<R>;

type ComponentOf<L> = L extends { start(...args: never[]): infer R } ? Produced<R> : undefined;

export type ComponentsOf<D> = { [L in LeavesOf<D> as NameOf<L>]: ComponentOf<L> };

export type SystemEvents = { [E in ComponentEventName]: [payload: ComponentEventPayloads[E]] } & SystemEventArguments;

export interface System<C = Components> extends EventEmitter<SystemEvents> {
  start(): Promise<C>;
  stop(): Promise<void>;
  restart(): Promise<C>;
  stopOn(...events: string[]): () => void;
}

export class TimeoutError extends Error {
  readonly name: 'TimeoutError';
}

export class AbortError extends Error {
  readonly name: 'AbortError';
}

export function createSystem<const D extends SystemDefinition>(
  definition: D,
  options?: SystemOptions,
): System<NoInfer<ComponentsOf<D>>>;
