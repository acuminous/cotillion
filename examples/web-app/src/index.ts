import { ComponentEvent, SystemEvent, createSystem } from 'cotillion';
import { app } from './components/app.ts';
import { httpServer } from './components/http-server.ts';
import { postgres } from './components/postgres.ts';
import { redis } from './components/redis.ts';

const system = createSystem([[postgres, redis], app, httpServer], {
  name: 'Example',
  timeouts: { start: 30000, stop: 10000 },
});

type Progress = { name: string | undefined };
type Failure = Progress & { error: Error };

const progress = [
  [SystemEvent.StartInitiated, 'system is starting'],
  [SystemEvent.StartSucceeded, 'system started'],
  [SystemEvent.StopInitiated, 'system is stopping'],
  [SystemEvent.StopSucceeded, 'system stopped'],
  [ComponentEvent.StartSucceeded, 'component started'],
  [ComponentEvent.StopSucceeded, 'component stopped'],
] as const;

const failures = [
  [SystemEvent.StartFailed, 'system failed to start'],
  [SystemEvent.StopFailed, 'system failed to stop'],
  [ComponentEvent.StartFailed, 'component failed to start'],
  [ComponentEvent.StopFailed, 'component failed to stop'],
] as const;

for (const [event, message] of progress) system.on(event, ({ name }: Progress) => console.log(`${name} ${message}`));
for (const [event, message] of failures)
  system.on(event, ({ name, error }: Failure) => console.error(`${name} ${message}`, error));

system.exitOn('SIGTERM', 'SIGINT');

const { httpServer: server } = await system.start();

console.log('listening', server.address());
