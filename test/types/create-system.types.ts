import {
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

const boundedStart: Promise<Components> = system.start({ timeout: 30000 });
const boundedStop: Promise<void> = system.stop({ timeout: 10000 });
const boundedRestart: Promise<Components> = system.restart({ timeout: 30000 });

const timedOut: Error = new TimeoutError('The start timed out after 30000ms waiting for postgres to start');
const timedOutName: 'TimeoutError' = timedOut instanceof TimeoutError ? timedOut.name : 'TimeoutError';

system.on(SystemEvent.StopSucceeded, () => {});
system.on(SystemEvent.StartFailed, (error) => error?.message);
system.on(ComponentEvent.StartFailed, ({ name, error }) => `${name} ${error?.message}`);

system.on('system_stop_succeeded', () => {});
system.on('component_start_skipped', ({ name, reason }) => `${name} ${reason}`);

const postgres = {
  name: 'postgres',
  timeout: { start: 5000, stop: 30000, abort: 1000 },
  async start(signal: AbortSignal) {
    return signal.aborted;
  },
  async stop() {},
};

const migrate = { name: 'migrate' };
const emailListener = { name: 'emailListener', timeout: 5000 };
const httpServer = { name: 'httpServer' };

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

// @ts-expect-error an operation's timeout is a number of milliseconds, not a description
system.start({ timeout: 'soon' });

// @ts-expect-error the system announces system_start_succeeded, not system_started
system.on('system_started', () => {});

// @ts-expect-error components are skipped for one of the documented reasons, and boredom is not one
const boredom: SkipReason = 'boredom';
