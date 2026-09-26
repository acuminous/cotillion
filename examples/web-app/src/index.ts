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
system.on(SystemEvent.StartSucceeded, ({ name, duration }) =>
  console.log(`${name} system started in ${duration.toFixed(0)}ms`),
);
system.on(SystemEvent.StartFailed, ({ name, error }) => console.error(`${name} system failed to start`, error));
system.on(SystemEvent.StopInitiated, ({ name }) => console.log(`${name} system is stopping`));
system.on(SystemEvent.StopSucceeded, ({ name, duration }) =>
  console.log(`${name} system stopped in ${duration.toFixed(0)}ms`),
);
system.on(SystemEvent.StopFailed, ({ name, error }) => console.error(`${name} system failed to stop`, error));

system.on(ComponentEvent.StartSucceeded, ({ name, duration }) =>
  console.log(`${name} component started in ${duration.toFixed(0)}ms`),
);
system.on(ComponentEvent.StopSucceeded, ({ name, duration }) =>
  console.log(`${name} component stopped in ${duration.toFixed(0)}ms`),
);
system.on(ComponentEvent.StartFailed, ({ name, error }) => console.error(`${name} component failed to start`, error));
system.on(ComponentEvent.StopFailed, ({ name, error }) => console.error(`${name} component failed to stop`, error));

system.exitOn('SIGTERM', 'SIGINT');

const { httpServer: server } = await system.start();

console.log('listening', server.address());
