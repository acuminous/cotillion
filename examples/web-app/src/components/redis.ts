import type { ComponentDefinition } from 'cotillion';
import { Redis } from 'ioredis';

let client: Redis | undefined;

export const redis = {
  name: 'redis',
  get component(): Redis {
    if (!client) throw new Error('redis has not started');
    return client;
  },
  async start() {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:16379', { lazyConnect: true });
    await client.connect();
    return client;
  },
  async stop() {
    await client?.quit();
    client = undefined;
  },
} as const satisfies ComponentDefinition;
