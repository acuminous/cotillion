import { SystemEvent, ComponentEvent, createSystem } from 'cotillion';
import { app } from './components/app.ts';
import { httpServer } from './components/http-server.ts';
import { postgres } from './components/postgres.ts';
import { redis } from './components/redis.ts';

const system = createSystem([[postgres, redis], app, httpServer], { timeouts: { start: 30000, stop: 10000 } });

system.on(SystemEvent.StartInitiated, () => 'System starting');
system.on(ComponentEvent.StartSucceeded, ({ name }) => console.log(`${name} started`));
system.on(ComponentEvent.StopSucceeded, ({ name }) => console.log(`${name} stopped`));
system.on(ComponentEvent.StartFailed, ({ name, error }) => console.error(`${name} failed to start`, error));
system.on(ComponentEvent.StopFailed, ({ name, error }) => console.error(`${name} failed to stop`, error));
system.on(SystemEvent.StartFailed, (error) => console.error('System failed to stop', error));


system.exitOn('SIGTERM', 'SIGINT');

const { httpServer: server } = await system.start();

console.log('listening', server.address());
