import { type StartValues, type System, createSystem } from '../../lib/index';

const system: System = createSystem([]);

const startValues: Promise<StartValues> = system.start();
const stopped: Promise<void> = system.stop();

system.on('system_start_succeeded', () => {});
system.on('system_stop_succeeded', () => {});

// @ts-expect-error a system is created from an array of components, not from nothing
const systemFromNothing: System = createSystem();

// @ts-expect-error a component without a name is not a component
const systemFromAnonymousComponents: System = createSystem([{}]);

// @ts-expect-error the system announces system_start_succeeded, not system_started
system.on('system_started', () => {});
