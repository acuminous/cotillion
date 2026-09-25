# cotillion example: a web app

A web app built on cotillion. Postgres and redis start in parallel, then a [Hono](https://hono.dev/) HTTP server which uses both; on SIGTERM or SIGINT they stop in reverse and the process exits.

```sh
npm install
npm run docker:up     # postgres and redis in Docker, waited for until healthy
npm start             # http://localhost:3000/health
npm run docker:down
```

The components are reusable: `postgres`, `redis` and `httpServer` import nothing from each other. Each start function receives the components which have already started, keyed by name, so the `app` component builds the Hono app from the postgres and redis clients it is given, and `httpServer` serves whatever `app` produced. `src/index.ts` lists them in order: the two clients in parallel, then the app, then the server. `npm start` runs the TypeScript directly with Node's type stripping, so it needs Node 22 or later.
