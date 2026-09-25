import type { ComponentDefinition } from 'cotillion';
import { Hono } from 'hono';
import type { Redis } from 'ioredis';
import type pg from 'pg';

export const app = {
  name: 'app',
  async start({ postgres, redis }: { postgres: pg.Client; redis: Redis }) {
    const app = new Hono();

    app.get('/', (c) => c.text('cotillion example: try /health'));

    app.get('/health', async (c) => {
      const [{ rows }, pong] = await Promise.all([postgres.query('select now() as now'), redis.ping()]);
      return c.json({ postgres: rows[0].now, redis: pong });
    });

    return app;
  },
} as const satisfies ComponentDefinition;
