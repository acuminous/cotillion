export interface Component {
  name: string;
}

export type StartValues = { [name: string]: unknown };

export type SystemEventName =
  | 'system_start_initiated'
  | 'system_start_succeeded'
  | 'system_stop_initiated'
  | 'system_stop_succeeded';

export interface System {
  on(event: SystemEventName, listener: () => void): this;
  start(): Promise<StartValues>;
  stop(): Promise<void>;
}

export function createSystem(components: readonly Component[]): System;
