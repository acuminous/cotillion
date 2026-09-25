const { equal: eq, ok, rejects } = require('node:assert/strict');
const { createServer } = require('node:http');
const Yadda = require('yadda');

const {
  Dictionary,
  ContextParamLibrary,
  localisation: { English },
} = Yadda;

module.exports = English.localise(new ContextParamLibrary(new Dictionary()))
  .given("the quick start's components", ({ world }) => {
    world.database = createDatabase();
    world.definition = [postgresDefinition(world.database), httpServerDefinition()];
    world.options = { timeout: { start: 30000, stop: 10000 } };
  })
  .then("the HTTP server answers a request with the database's reply", async ({ world }) => {
    const { httpServer } = await world.starts.at(-1).promise;
    const response = await fetch(`http://127.0.0.1:${httpServer.address().port}/`);
    eq(await response.text(), 'select 1 -> ok');
  })
  .then('the HTTP server has closed', async ({ world }) => {
    const { httpServer } = await world.starts.at(-1).promise;
    ok(!httpServer.listening, 'the server is still listening');
    await rejects(fetch(`http://127.0.0.1:${httpServer.address()?.port ?? 0}/`));
  })
  .then('the database client has ended', ({ world }) => {
    eq(world.database.ended, true);
  });

function createDatabase() {
  const database = { connected: false, ended: false };
  database.client = {
    async connect() {
      database.connected = true;
    },
    async query(sql) {
      if (!database.connected || database.ended) throw new Error('the client is not connected');
      return `${sql} -> ok`;
    },
    async end() {
      database.ended = true;
    },
  };
  return database;
}

function postgresDefinition(database) {
  let client;
  return {
    name: 'postgres',
    async start() {
      client = database.client;
      await client.connect();
      return client;
    },
    async stop() {
      await client?.end();
      client = undefined;
    },
  };
}

function httpServerDefinition() {
  let server;
  return {
    name: 'httpServer',
    async start({ postgres }) {
      server = createServer((req, res) => {
        postgres.query('select 1').then((reply) => res.end(reply));
      });
      await new Promise((resolve, reject) =>
        server.listen(0, '127.0.0.1').once('listening', resolve).once('error', reject),
      );
      return server;
    },
    async stop() {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}
