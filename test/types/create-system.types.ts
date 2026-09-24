import {
  AbortError,
  ComponentEvent,
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

const bounded: System = createSystem([], { timeout: 30000 });
const boundedSeparately: System = createSystem([], { timeout: { start: 30000, stop: 10000 } });
const abortable: System = createSystem([
  { name: 'postgres', abortable: true, async start(components: Components, signal: AbortSignal) {} },
]);

const timedOut: Error = new TimeoutError('The start timed out after 30000ms waiting for postgres to start');
const timedOutName: 'TimeoutError' = timedOut instanceof TimeoutError ? timedOut.name : 'TimeoutError';

const abortError: Error = new AbortError('The start was aborted while waiting for postgres to start');
const abortedName: 'AbortError' = abortError instanceof AbortError ? abortError.name : 'AbortError';

system.on(SystemEvent.StopSucceeded, () => {});
system.on(SystemEvent.StartFailed, (error) => error?.message);
system.on(ComponentEvent.StartFailed, ({ name, error }) => `${name} ${error?.message}`);

system.on('system_stop_succeeded', () => {});
system.on('component_start_skipped', ({ name, reason }) => `${name} ${reason}`);

const postgres = {
  name: 'postgres',
  timeout: { start: 5000, stop: 30000 },
  async start(components: Components, signal: AbortSignal) {
    return { connected: !signal.aborted };
  },
  async stop() {},
};

const migrate = { name: 'migrate' };
const emailListener = { name: 'emailListener', timeout: 5000 };
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

// @ts-expect-error finish is not one of the three timeout keys
const unknownTimeoutKey: System = createSystem([{ name: 'postgres', timeout: { start: 1000, finish: 1000 } }]);

// @ts-expect-error a timeout is a number of milliseconds, not a description
const timeoutWhichIsNotANumber: System = createSystem([{ name: 'postgres', timeout: 'soon' }]);

// @ts-expect-error start is a function, not a description
const startWhichIsNotAFunction: System = createSystem([{ name: 'postgres', start: 'soon' }]);

// @ts-expect-error a system timeout is a number of milliseconds, not a description
const systemTimeoutWhichIsNotANumber: System = createSystem([], { timeout: 'soon' });

// @ts-expect-error the timeouts are start and stop; nothing is aborted on a timer
const systemAbortTimeout: System = createSystem([], { timeout: { abort: 1000 } });

// @ts-expect-error a stop is never interrupted, so it is given nothing
const stopExpectingASignal: System = createSystem([{ name: 'postgres', async stop(signal: AbortSignal) {} }]);

// @ts-expect-error a start is given the components started so far first, and its abort signal second
const startExpectingTheSignalFirst: System = createSystem([{ name: 'postgres', async start(signal: AbortSignal) {} }]);

// @ts-expect-error abortable is a flag, not a description
const abortableWhichIsNotABoolean: System = createSystem([{ name: 'postgres', abortable: 'yes' }]);

// @ts-expect-error the system announces system_start_succeeded, not system_started
system.on('system_started', () => {});

// @ts-expect-error components are skipped for one of the documented reasons, and boredom is not one
const boredom: SkipReason = 'boredom';
