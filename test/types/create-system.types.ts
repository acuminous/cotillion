import {
  ComponentEvent,
  type SkipReason,
  type StartValues,
  type System,
  SystemEvent,
  createSystem,
} from '../../lib/index';

const system: System = createSystem([]);

const startValues: Promise<StartValues> = system.start();
const stopped: Promise<void> = system.stop();
const restarted: Promise<StartValues> = system.restart();

system.on(SystemEvent.StopSucceeded, () => {});
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

// @ts-expect-error a system is created from an array of components, not from nothing
const systemFromNothing: System = createSystem();

// @ts-expect-error a component without a name is not a component
const systemFromAnonymousComponents: System = createSystem([{}]);

// @ts-expect-error finish is not one of the three timeout keys
const unknownTimeoutKey: System = createSystem([{ name: 'postgres', timeout: { start: 1000, finish: 1000 } }]);

// @ts-expect-error a timeout is a number of milliseconds, not a description
const timeoutWhichIsNotANumber: System = createSystem([{ name: 'postgres', timeout: 'soon' }]);

// @ts-expect-error start is a function, not a description
const startWhichIsNotAFunction: System = createSystem([{ name: 'postgres', start: 'soon' }]);

// @ts-expect-error the system announces system_start_succeeded, not system_started
system.on('system_started', () => {});

// @ts-expect-error components are skipped for one of four reasons, and boredom is not one
const boredom: SkipReason = 'boredom';
