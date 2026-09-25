import { type ServerType, serve } from '@hono/node-server';
import type { ComponentDefinition } from 'cotillion';
import { Hono } from 'hono';
import { postgres } from './postgres.ts';
import { redis } from './redis.ts';

let server: ServerType | undefined;

export const httpServer = {
  name: 'httpServer',
  get component(): ServerType {
    if (!server) throw new Error('httpServer has not started');
    return server;
  },
  async start() {
    const app = new Hono();

    app.get('/', (c) => c.text('cotillion example: try /health'));

    app.get('/health', async (c) => {
      const [{ rows }, pong] = await Promise.all([
        postgres.component.query('select now() as now'),
        redis.component.ping(),
      ]);
      return c.json({ postgres: rows[0].now, redis: pong });
    });

    const port = Number(process.env.PORT ?? 3000);
    server = await new Promise<ServerType>((resolve) => {
      const listening = serve({ fetch: app.fetch, port }, () => resolve(listening));
    });
    return server;
  },
  async stop() {
    await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
    server = undefined;
  },
} as const satisfies ComponentDefinition;
