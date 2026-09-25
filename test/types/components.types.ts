import { type Components, type System, createSystem } from '../../lib/index';

const postgres = {
  name: 'postgres',
  async start() {
    return { query: (sql: string) => sql };
  },
  async stop() {},
};

const inline = createSystem([
  { name: 'migrate' },
  { name: 'emailListener', start: () => 'subscribed' },
  [
    { name: 'smsListener', async start() {} },
    [
      {
        name: 'pushListener',
        async start() {
          return 42;
        },
      },
      {
        name: 'auditLog',
        async start() {
          return { entries: [] as string[] };
        },
      },
    ],
  ],
  {
    name: 'httpServer',
    async start(components: Components, signal: AbortSignal) {
      return { listening: !signal.aborted, count: Object.keys(components).length };
    },
  },
]);

async function inferred() {
  const components = await inline.start();
  const migrate: undefined = components.migrate;
  const emailListener: string = components.emailListener;
  const smsListener: undefined = components.smsListener;
  const pushListener: number = components.pushListener;
  const auditLog: { entries: string[] } = components.auditLog;
  const httpServer: { listening: boolean; count: number } = components.httpServer;
  const restarted: typeof components = await inline.restart();
  return { migrate, emailListener, smsListener, pushListener, auditLog, httpServer, restarted };
}

async function readme() {
  const system = createSystem([postgres, { name: 'httpServer', start: async () => ({ port: 3000 }) }]);
  const { postgres: client, httpServer: server } = await system.start();
  const sql: string = client.query('select 1');
  const port: number = server.port;
  return { sql, port };
}

async function notAComponent() {
  const components = await inline.start();
  // @ts-expect-error nothing in the definition is called redis
  return components.redis;
}

const widened: System = createSystem([postgres]);

export { inferred, readme, notAComponent, widened };
