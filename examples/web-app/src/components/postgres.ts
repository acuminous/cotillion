import type { ComponentDefinition, Components, StartContext } from 'cotillion';
import pg from 'pg';

let client: pg.Client | undefined;

export const postgres = {
  name: 'postgres',
  get component(): pg.Client {
    if (!client) throw new Error('postgres has not started');
    return client;
  },
  async start(_components: Components, { fail }: StartContext) {
    client = new pg.Client({
      connectionString: process.env.DATABASE_URL ?? 'postgres://cotillion:cotillion@localhost:15432/cotillion',
    });
    client.on('error', fail);
    await client.connect();
    return client;
  },
  async stop() {
    await client?.end();
    client = undefined;
  },
} as const satisfies ComponentDefinition;
