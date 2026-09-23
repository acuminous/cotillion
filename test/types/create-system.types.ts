import { ComponentEvent, type StartValues, type System, SystemEvent, createSystem } from '../../lib/index';

const system: System = createSystem([]);

const startValues: Promise<StartValues> = system.start();
const stopped: Promise<void> = system.stop();

system.on(SystemEvent.StopSucceeded, () => {});
system.on(ComponentEvent.StartFailed, ({ name, error }) => `${name} ${error?.message}`);

system.on('system_stop_succeeded', () => {});
system.on('component_start_skipped', ({ name, reason }) => `${name} ${reason}`);

// @ts-expect-error a system is created from an array of components, not from nothing
const systemFromNothing: System = createSystem();

// @ts-expect-error a component without a name is not a component
const systemFromAnonymousComponents: System = createSystem([{}]);

// @ts-expect-error the system announces system_start_succeeded, not system_started
system.on('system_started', () => {});

// @ts-expect-error components are skipped for one of four reasons, and boredom is not one
const boredom: import('../../lib/index').SkipReason = 'boredom';
