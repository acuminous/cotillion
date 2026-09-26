import {
  AbortError,
  ComponentEvent,
  type ComponentEventPayloads,
  type Components,
  type SkipReason,
  type System,
  SystemEvent,
  TimeoutError,
  createSystem,
} from '../../lib/index';

const system: System = createSystem([]);

const components: Promise<Components> = system.start();
const stopped: Promise<void> = system.stop();
const restarted: Promise<Components> = system.restart();
const unbind: () => void = system.stopOn('SIGTERM', 'SIGINT');
const unbindExit: () => void = system.exitOn('SIGTERM', 'SIGINT');

const bounded: System = createSystem([], { timeouts: 30000 });
const named: System = createSystem([], { name: 'orders', timeouts: 30000 });
const systemName: string | undefined = named.name;
const boundedSeparately: System = createSystem([], { timeouts: { start: 30000, stop: 10000 } });
const abortable: System = createSystem([
  { name: 'postgres', abortable: true, async start(components: Components, signal: AbortSignal) {} },
]);

const timedOut: Error = new TimeoutError('The start timed out after 30000ms waiting for postgres to start');
const timedOutName: 'TimeoutError' = timedOut instanceof TimeoutError ? timedOut.name : 'TimeoutError';

const abortError: Error = new AbortError('The start was aborted while waiting for postgres to start');
const abortedName: 'AbortError' = abortError instanceof AbortError ? abortError.name : 'AbortError';

system.on(SystemEvent.StopSucceeded, () => {});
system.on(SystemEvent.StartFailed, ({ name, error }) => `${name} ${error.message}`);
system.on(ComponentEvent.StartFailed, ({ name, error }) => `${name} ${error.message}`);
system.on(ComponentEvent.StartAborted, ({ name, reason }) => `${name} ${reason}`);
system.once(ComponentEvent.StopSucceeded, ({ name, duration }) => `${name} ${duration.toFixed(0)}ms`);
system.on(SystemEvent.StopSucceeded, ({ duration }) => duration.toFixed(0));
system.off(SystemEvent.StopFailed, ({ error }) => error.message);

system.on('system_stop_succeeded', () => {});
system.on('system_stop_failed', ({ name, error }) => `${name} ${error.message}`);
system.on('component_start_skipped', ({ name, reason }) => `${name} ${reason}`);
system.once('component_start_initiated', ({ name }) => name);
system.off('component_stop_failed', ({ name, error }) => `${name} ${error.message}`);
system.removeListener('system_stop_initiated', () => {});
system.emit('component_start_initiated', { name: 'postgres' });

// @ts-expect-error a component event is emitted with its payload
system.emit('component_start_initiated');

// @ts-expect-error a succeeded component event carries no error
system.on('component_start_succeeded', ({ error }) => error);

// @ts-expect-error a succeeded component event carries no error, in enum form either
system.on(ComponentEvent.StopSucceeded, ({ error }) => error);

// @ts-expect-error an initiated component event has not lasted any time yet
system.on('component_start_initiated', ({ duration }) => duration);

// @ts-expect-error an initiated component event carries no reason
system.on('component_stop_initiated', ({ reason }) => reason);

// @ts-expect-error a succeeded system event carries no error
system.on('system_start_succeeded', ({ error }) => error);

// @ts-expect-error an aborted component was interrupted by a stop or a timeout, never skipped as missing
const missingAbort: ComponentEventPayloads['component_start_aborted'] = { name: 'postgres', reason: 'missing' };

const postgres = {
  name: 'postgres',
  timeouts: { start: 5000, stop: 30000 },
  async start(components: Components, signal: AbortSignal) {
    return { connected: !signal.aborted };
  },
  async stop() {},
};

const migrate = { name: 'migrate' };
const emailListener = { name: 'emailListener', timeouts: 5000 };
const httpServer = {
  name: 'httpServer',
  async start({ postgres }: { postgres: { connected: boolean } }) {
    return postgres.connected;
  },
};

const nested: System = createSystem([postgres, [[migrate, emailListener], httpServer]]);

// @ts-expect-error a system is created from a definition, not from nothing
const systemFromNothing: System = createSystem();

// @ts-expect-error a definition without a name does not define a component
const systemFromAnonymousComponents: System = createSystem([{}]);

// @ts-expect-error a timeout is a number of milliseconds, not a description
const timeoutWhichIsNotANumber: System = createSystem([{ name: 'postgres', timeouts: 'soon' }]);

// @ts-expect-error start is a function, not a description
const startWhichIsNotAFunction: System = createSystem([{ name: 'postgres', start: 'soon' }]);

// @ts-expect-error a system's name is a string
const nameWhichIsNotAString: System = createSystem([], { name: 42 });

// @ts-expect-error a system timeout is a number of milliseconds, not a description
const systemTimeoutWhichIsNotANumber: System = createSystem([], { timeouts: 'soon' });

// @ts-expect-error the timeouts are start and stop; nothing is aborted on a timer
const systemAbortTimeout: System = createSystem([], { timeouts: { abort: 1000 } });

// @ts-expect-error a stop is never interrupted, so it is given nothing
const stopExpectingASignal: System = createSystem([{ name: 'postgres', async stop(signal: AbortSignal) {} }]);

// @ts-expect-error a start is given the components started so far first, and its abort signal second
const startExpectingTheSignalFirst: System = createSystem([{ name: 'postgres', async start(signal: AbortSignal) {} }]);

// @ts-expect-error the events are given as arguments, not wrapped in options
system.stopOn({ events: ['SIGTERM'] });

// @ts-expect-error abortable is a flag, not a description
const abortableWhichIsNotABoolean: System = createSystem([{ name: 'postgres', abortable: 'yes' }]);

// @ts-expect-error the system announces system_start_succeeded, not system_started
system.on('system_started', () => {});

// @ts-expect-error components are skipped for one of the documented reasons, and boredom is not one
const boredom: SkipReason = 'boredom';
