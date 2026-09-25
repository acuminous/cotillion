# cotillion example: a skeleton service

A skeleton service built on cotillion. Postgres and redis start in parallel, then a [Hono](https://hono.dev/) HTTP server which uses both; on SIGTERM or SIGINT they stop in reverse and the process exits.

```sh
npm install
npm run docker:up     # postgres and redis in Docker, waited for until healthy
npm start             # http://localhost:3000/health
npm run docker:down
```

The layout follows the README's quick start: each component in its own file under `src/components`, exposing what its start created through a `component` getter; the Hono app and its routes in `src/app.ts`; and `src/index.ts` listing the components in order. `npm start` runs the TypeScript directly with Node's type stripping, so it needs Node 22 or later.
