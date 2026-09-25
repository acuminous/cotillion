import type { ComponentDefinition } from '../../lib/index';
import { ComponentEvent, SystemEvent, createSystem } from '../../lib/index';

interface Client {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string): Promise<unknown>;
}

interface Server {
  address(): string;
}

declare function connectClient(): Client;
declare function listen(): Server;

let client: Client | undefined;

export const postgres = {
  name: 'postgres',
  get component(): Client {
    if (!client) throw new Error('postgres has not started');
    return client;
  },
  async start() {
    client = connectClient();
    await client.connect();
    return client;
  },
  async stop() {
    await client?.end();
    client = undefined;
  },
} as const satisfies ComponentDefinition;

let server: Server;

export const httpServer = {
  name: 'httpServer',
  async start() {
    await postgres.component.query('select 1');
    server = listen();
    return server;
  },
} as const satisfies ComponentDefinition;

export const injected = {
  name: 'injected',
  async start({ postgres }: { postgres: Client }) {
    return postgres.query('select 1');
  },
} as const satisfies ComponentDefinition;

async function quickStart() {
  const system = createSystem([postgres, httpServer], { timeouts: { start: 30000, stop: 10000 } });

  system.on(ComponentEvent.StartSucceeded, ({ name }) => name);
  system.on(ComponentEvent.StartFailed, ({ name, error }) => `${name} ${error.message}`);
  system.on(SystemEvent.StartFailed, () => {
    process.exitCode = 1;
  });
  system.on(SystemEvent.StopSucceeded, () => process.exit());

  system.stopOn('SIGTERM', 'SIGINT');

  const { postgres: client, httpServer: server } = await system.start();

  await client.query('select 1');
  return server.address();
}

async function injectedStyle() {
  const { injected: reply } = await createSystem([postgres, injected]).start();
  const same: Client = postgres.component;
  return { reply, same };
}

export { quickStart, injectedStyle };
