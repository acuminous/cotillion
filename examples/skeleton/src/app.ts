import { Hono } from 'hono';
import { postgres } from './components/postgres.ts';
import { redis } from './components/redis.ts';

export const app = new Hono();

app.get('/', (c) => c.text('cotillion example: try /health'));

app.get('/health', async (c) => {
  const [{ rows }, pong] = await Promise.all([postgres.component.query('select now() as now'), redis.component.ping()]);
  return c.json({ postgres: rows[0].now, redis: pong });
});
