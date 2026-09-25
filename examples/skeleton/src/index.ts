import { ComponentEvent, SystemEvent, createSystem } from 'cotillion';
import { app } from './components/app.ts';
import { httpServer } from './components/http-server.ts';
import { postgres } from './components/postgres.ts';
import { redis } from './components/redis.ts';

const system = createSystem([[postgres, redis], app, httpServer], {
  name: 'Example',
  timeouts: { start: 30000, stop: 10000 },
});

system.on(SystemEvent.StartInitiated, ({ name }) => console.log(`${name} system is starting`));
system.on(SystemEvent.StartSuceeded, ({ name }) => console.log(`${name} system started`));
system.on(SystemEvent.StartFailed, ({ name, error }) => console.log(`${name} system failed to start`, error));
system.on(SystemEvent.StopInitiated, ({ name }) => console.log(`${name} system is stopping`));
system.on(SystemEvent.StopSuceeded, ({ name }) => console.log(`${name} system stopped`));
system.on(SystemEvent.StopFailed, ({ name, error }) => console.log(`${name} system failed to stop`, error));

system.on(ComponentEvent.StartSucceeded, ({ name }) => console.log(`${name} component started`));
system.on(ComponentEvent.StopSucceeded, ({ name }) => console.log(`${name} component stopped`));
system.on(ComponentEvent.StartFailed, ({ name, error }) => console.error(`${name} component failed to start`, error));
system.on(ComponentEvent.StopFailed, ({ name, error }) => console.error(`${name} component failed to stop`, error));

system.exitOn('SIGTERM', 'SIGINT');

const { httpServer: server } = await system.start();

console.log('listening', server.address());
