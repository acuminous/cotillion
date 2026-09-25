import { type ServerType, serve } from '@hono/node-server';
import type { ComponentDefinition } from 'cotillion';
import { app } from '../app.ts';

let server: ServerType | undefined;

export const httpServer = {
  name: 'httpServer',
  get component(): ServerType {
    if (!server) throw new Error('httpServer has not started');
    return server;
  },
  async start() {
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
