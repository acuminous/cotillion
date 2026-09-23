# cotillion

Graceful orchestration of network components.

![An engraving of an 18th century cotillion: four couples dancing a figure while musicians play from a gallery](assets/the-cotillion-dance.jpg)

*The Cotillion Dance, engraved by James Caldwall after John Collet, 1771. [Yale Center for British Art, CC0](https://commons.wikimedia.org/wiki/File:James_Caldwall_-_The_Cotillion_Dance_-_B1977.14.11242_-_Yale_Center_for_British_Art.jpg).*

A cotillion is a formal group dance of the 18th century, performed in figures called in strict order. This library calls the figures for your application's network components: database clients, queue listeners, HTTP servers. You supply an array of named components with asynchronous start and stop functions. Cotillion starts them in the order you declare, sequentially or in parallel groups, stops them in the reverse order, enforces an overall timeout on each operation, and can abort a component which refuses to finish.

## Contents

- [The problem](#the-problem)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Components](#components)
- [Starting and stopping](#starting-and-stopping)
- [Start values](#start-values)
- [Events](#events)
- [Timeouts](#timeouts)
- [Aborting](#aborting)
- [Process events](#process-events)
- [Parallel groups](#parallel-groups)
- [Errors](#errors)
- [License](#license)

## The problem

Most applications depend on network components which must be started in a particular order and stopped in the reverse order. The HTTP server must not accept requests before the database client is connected; the database client must not disconnect while the queue listener is still processing messages.

Hand-rolled startup code tends to get this right but is often messy. Graceful shutdown code is frequently forgotten. Orderly shutdown is what stops a deploy from dropping in-flight requests, and it is also where the awkward cases live: a component which hangs while stopping, a shutdown which must complete before the orchestrator's grace period expires, a second termination signal arriving while the first is still being handled.

Dependency injection frameworks such as [systemic](https://github.com/onebeyond/systemic) solve the ordering problem as a side effect of wiring, but bring a container, a registration API and a dependency graph with them. Full application frameworks such as [NestJS](https://nestjs.com/) go further still: its container initialises modules in dependency order and, once shutdown hooks are enabled, destroys them in reverse. If you are already building on Nest, that may be all you need. But adopting an entire framework to get orderly startup and shutdown is a heavy trade, and even then each lifecycle hook is awaited indefinitely: a shutdown handler which hangs, hangs.

If your wiring is simple enough to express as plain code, all you are missing is the lifecycle: ordered startup, reverse ordered shutdown, timeouts, and a way out when a component misbehaves. Just as valuable is what the interface does to the code itself. Each component's startup and shutdown live together, behind the same small shape, so the lifecycle of the database client reads like the lifecycle of the queue listener and the HTTP server, and the entrypoint shrinks to a list of components in order, rather than a tangle of connection handling, signal handlers and exit paths accumulated over time.

## How it works

You define components, list them in start order, and create a system:

1. Each component has a unique name and asynchronous start and stop functions.
2. The array defines the order. Nested arrays form groups which run in parallel.
3. Starting the system runs the start functions in the declared order, sequentially or in parallel groups, racing the whole operation against an optional overall timeout, and resolves to an object holding each component's start value, keyed by name.
4. Stopping the system runs the stop functions in the reverse order, again racing an optional overall timeout.
5. Aborting the system gives up on the in-flight component and short circuits the rest.
6. The system is an event emitter, announcing the progress of each component and of each operation as a whole.

How an individual component honours timeouts or cancellation is up to the implementor. Cotillion passes each start and stop function an [AbortSignal](https://nodejs.org/api/globals.html#class-abortsignal) which fires on timeout or abort; a component may observe it to clean up promptly, or ignore it, in which case cotillion waits for it to wind down, bounded by the component's abort timeout where one is set.

## Installation

```sh
npm install cotillion
```

Requirements:

- Node.js 22 or later

Cotillion has no production dependencies.

## Quick start

Each component lives in its own file, behind the same small shape.

**components/postgres.ts**

```ts
import pg from 'pg';

export let client: pg.Client;

export const postgres = {
  name: 'postgres',
  async start() {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return client;
  },
  async stop() {
    await client.end();
  },
};
```

**components/http-server.ts**

```ts
import { createServer, type Server } from 'node:http';
import { client } from './postgres.ts';
import { handle } from '../handle.ts';

let server: Server;

export const httpServer = {
  name: 'httpServer',
  async start() {
    server = createServer((req, res) => handle(req, res, client));
    await new Promise<void>((resolve, reject) => server.listen(3000).once('listening', resolve).once('error', reject));
    return server;
  },
  async stop() {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  },
};
```

**index.ts**

```ts
import { createSystem } from 'cotillion';
import { postgres } from './components/postgres.ts';
import { httpServer } from './components/http-server.ts';

const system = createSystem([postgres, httpServer]);

system.on('component_start_succeeded', ({ name }) => console.log(`${name} started`));
system.on('component_stop_succeeded', ({ name }) => console.log(`${name} stopped`));
system.on('component_start_failed', ({ name, error }) => console.error(`${name} failed to start`, error));
system.on('component_stop_failed', ({ name, error }) => console.error(`${name} failed to stop`, error));

system.on('system_stop_succeeded', () => process.exit(0));
system.on('system_stop_failed', () => process.exit(1));

system.stopOn({ events: ['SIGTERM', 'SIGINT'], timeout: 10000 });

const { postgres: client, httpServer: server } = await system.start({ timeout: 30000 });

await client.query('select 1');
console.log('listening', server.address());
```

The entrypoint is a list of components in order, and each start value comes back from `system.start`, keyed by component name. The wiring between components stays plain code: the postgres module exports its client and the HTTP server imports it.

## Components

A component is a plain object:

```ts
const component = {
  name: 'email-listener',
  timeout: { start: 5000, stop: 30000 },
  async start(signal: AbortSignal) {
    // acquire connections, subscribe, listen
  },
  async stop(signal: AbortSignal) {
    // drain, unsubscribe, disconnect
  },
};
```

- `name` is required and must be unique within the system. It keys the object of [start values](#start-values), identifies the component in [events](#events), and appears in error messages so you can see which component failed, timed out or was aborted. Uniqueness is validated when the system is created.
- `start` and `stop` are optional; a missing function is skipped. Both receive an AbortSignal, described under [Timeouts](#timeouts). Whatever start returns is collected into the object of start values.
- `timeout` is optional: a number of milliseconds bounding both start and stop, or an object with `start`, `stop` and `abort` keys, each omissible. `start` and `stop` bound the invocations themselves; `abort` bounds how long cotillion waits for an aborted invocation to wind down. There are no defaults; see [Timeouts](#timeouts) and [Aborting](#aborting).

Cotillion imposes nothing else. Components hold their own state, and you wire dependencies between them in plain code, as in the quick start above.

## Starting and stopping

`createSystem(components)` validates the component array eagerly: missing names, duplicate names and malformed components are rejected at construction, not at start.

`system.start(options)` starts each component sequentially and, when the last one has started, resolves to the object of [start values](#start-values). If a component's start rejects, the system stops starting: the error propagates, and components which had already started remain started. Calling `system.stop()` afterwards stops exactly those components, in reverse order, so the recovery path after a failed start is the same call as a normal shutdown.

`system.stop(options)` stops the started components sequentially in reverse order and resolves when the last one has stopped. If a component's stop rejects, the error propagates and earlier components are not stopped, consistent with start; `abort()` covers the stuck component case. A subsequent `stop()` retries from where the failed, timed-out or aborted one left off, stopping only the components which have not yet stopped.

Both operations are idempotent. Starting a system which is already started has no effect, resolving to the existing start values; stopping a system which is already stopped, or was never started, has no effect, resolving immediately. Calling an operation which is already in progress joins it rather than beginning it again.

A stopped system can be started again, and `system.restart(options)` is the convenient composition: a stop followed by a start, resolving to the fresh start values. Its overall timeout bounds the whole round trip, so whatever the stop leaves unspent bounds the start. Restarting a system which is stopped, or was never started, simply starts it.

## Start values

Whatever a component's start function returns is collected into an object literal, keyed by component name, which `start()` resolves to:

```ts
const { postgres, httpServer } = await system.start({ timeout: 30000 });
await postgres.query('select 1');
```

Every component appears in the object; one with no start function, or whose start returned nothing, appears with the value `undefined`. The object is unordered by intent: sequencing is the array's job, and the object exists so the caller can reach the things starting created, such as a connected database client. It is also why component names must be unique, which is validated when the system is created. Any string is a valid name; one which is also a valid identifier destructures as above, and the rest are reachable by index access.

In TypeScript the object is typed: each property has whatever type its component's start function resolved to, inferred from the component array passed to `createSystem`, so the destructured `postgres` above is a `pg.Client` without a cast.

The start values only resolve once the whole system has started, so they cannot wire components to each other mid-start; wiring stays plain code, as in the [quick start](#quick-start). Cotillion never passes one component's start value to another: that would be dependency injection by the back door.

## Events

A system is an [EventEmitter](https://nodejs.org/api/events.html#class-eventemitter). Component events announce each component's progress; system events announce each operation as a whole. The names follow one pattern, so they are guessable: the scope (`component_` or `system_`), the operation (`start` or `stop`), then what happened. Events are notifications for logging, diagnostics and exit handling: they do not alter the promise contract, and listening to none of them is fine.

### Component events

| Event                     | Emitted when                                                                                                                                                            | Payload      |
|---------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| component_start_initiated | A component's start has been initiated                                                                                                                                  | name         |
| component_start_succeeded | A component's start has resolved                                                                                                                                        | name         |
| component_start_failed    | A component's start rejected                                                                                                                                            | name, error  |
| component_start_skipped   | A component's start was never attempted, because an earlier component failed, the overall timeout expired, abort() was called, or the component has no start function   | name, reason |
| component_start_aborted   | Cotillion cut away from the component's start without it settling, because the overall timeout expired or abort() was called                                            | name, reason |
| component_stop_initiated  | A component's stop has been initiated                                                                                                                                   | name         |
| component_stop_succeeded  | A component's stop has resolved                                                                                                                                         | name         |
| component_stop_failed     | A component's stop rejected                                                                                                                                             | name, error  |
| component_stop_skipped    | A component's stop was never attempted, because another component's stop failed, the overall timeout expired, abort() was called, or the component has no stop function | name, reason |
| component_stop_aborted    | Cotillion cut away from the component's stop without it settling, because the overall timeout expired or abort() was called                                             | name, reason |

Every component event listener receives a single payload object. `name` is the component's name, `error` is the component's own error, and `reason` is one of `'timeout'`, `'abort'`, `'failure'` or `'missing'`.

### System events

| Event                  | Emitted when                                             | Payload |
|------------------------|----------------------------------------------------------|---------|
| system_start_initiated | A start has been initiated                               |         |
| system_start_succeeded | Every component started                                  |         |
| system_start_failed    | The start rejected, whether failed, timed out or aborted | error   |
| system_stop_initiated  | A stop has been initiated                                |         |
| system_stop_succeeded  | Every started component stopped                          |         |
| system_stop_failed     | The stop rejected, whether failed, timed out or aborted  | error   |

The failed system events receive the operation's error, the same one its promise rejects with. The others carry no payload.

```ts
system.on('component_start_failed', ({ name, error }) => logger.error(`${name} failed to start`, error));
system.on('system_stop_succeeded', () => process.exit(0));
```

Entries of a parallel group emit individually, so listeners observe the interleaving. The aborted events fire when cotillion cuts away from a component without its invocation settling; an aborted component which winds down within its `abort` timeout emits its failed or succeeded event as normal, even though the operation itself still rejects. No event is named `error`, deliberately: Node.js throws when an `error` event has no listener, and no cotillion listener is ever mandatory.

## Timeouts

Both operations accept an overall timeout in milliseconds:

```ts
await system.start({ timeout: 30000 });
await system.stop({ timeout: 10000 });
```

The timeout covers the whole operation, not each component. When it expires, the operation is aborted: the remaining components are skipped and the operation rejects with a `TimeoutError` naming the component, or components, it was waiting for.

Each start and stop function receives an AbortSignal which fires at that moment. A well-behaved component uses it to release resources promptly:

```ts
async start(signal: AbortSignal) {
  await queue.subscribe({ signal });
}
```

Cotillion does not depend on the component observing the signal, but it does give the component a chance to comply. When the overall timeout expires, the remaining components are skipped, and cotillion waits for the in-flight invocation to wind down before rejecting, bounded by the component's `abort` timeout. A component with no abort timeout is waited on until it settles, or until `abort()` cuts the wait short. A component cut away before its start settled is treated as started, so a subsequent `stop()` will attempt to stop it and release whatever it had acquired.

Omitting the timeout means cotillion waits indefinitely, which is where aborting comes in.

### Component timeouts

A component may also declare its own timeout, bounding each invocation of its start and stop:

```ts
const emailListener = {
  name: 'email-listener',
  timeout: { start: 5000, stop: 30000 },
  // ...
};
```

A number bounds both functions; the object form bounds them separately, and any key may be omitted. There are no defaults: a component without a timeout is bounded only by the operation's overall timeout. Both bounds fire the same AbortSignal, so the effective deadline for any invocation is whichever expires first.

The two timeouts mean different things when they expire. A component exceeding its own timeout has **failed**: the invocation rejects with a `TimeoutError`, the corresponding failed event is emitted, and the operation fails fast exactly as if the component had rejected of its own accord. The overall timeout expiring means the operation was **aborted**: the remaining components are skipped. In both cases the aborted invocation is given the chance to wind down, bounded by the `abort` timeout, described under [Aborting](#aborting).

## Aborting

`system.abort()` gives up on the operation currently in progress. The in-flight component's signal fires, the remaining components are short circuited, and once the in-flight invocation has wound down, the pending `start()` or `stop()` promise rejects with an `AbortError`.

Aborting a component is not instantaneous. A start that was mid-handshake may still take time to release what it acquired, and cutting away from it would leave it executing detached. So cotillion waits for an aborted invocation to settle, and the component's `abort` timeout bounds that wait: when it expires, cotillion cuts away regardless. A component with no abort timeout, and no intention of settling, can be dealt with by calling `abort()` again, which cuts away immediately.

The motivating case is the impatient operator, or the second termination signal; [stopping on process events](#process-events) wires exactly this escalation up for you. Aborting when no operation is in progress does nothing.

## Process events

`system.stopOn(options)` stops the system when the process emits any of the given events, so you do not have to wire shutdown handlers yourself:

```ts
system.stopOn({ events: ['SIGTERM', 'SIGINT'], timeout: 10000 });
```

The events are explicit: cotillion does not presume which process events mean shutdown in your deployment. Termination signals are the usual choice, but any process event will do. The first to arrive stops the system, bounded by the given overall timeout. A further event aborts the stop rather than waiting it out, and another cuts away from whatever refused to wind down.

Cotillion does not call `process.exit`, and does not presume your exit codes. The stop's outcome arrives as a [system event](#system-events), so exiting stays a one-liner in your hands:

```ts
system.on('system_stop_succeeded', () => process.exit(0));
system.on('system_stop_failed', () => process.exit(1));
```

Call `stopOn` before starting, as in the [quick start](#quick-start): a termination signal can arrive while the system is still starting. An event received mid-start aborts the start, waits for the in-flight component to wind down, then stops whatever had started, announcing the outcome through the same system events. An event received before any operation stops a never-started system, which resolves, and announces `system_stop_succeeded`, immediately.

`stopOn` returns a function which unbinds the listeners again.

Internally, each bound listener re-emits the signal as a private stop event on the system, keyed by a Symbol so it cannot collide with your own events, and the system subscribes to it with `once()`. However many signals arrive, across however many bindings, the system only ever begins one stop.

## Parallel groups

A nested array is a parallel group. Its entries start concurrently, and the group counts as one step in the enclosing sequence: the next component does not start until every entry of the group has started.

```ts
const system = createSystem([
  postgres,
  [emailListener, smsListener, pushListener],
  httpServer,
]);
```

On stop, order reverses around the group: `httpServer` stops first, then the three listeners stop concurrently, then `postgres`.

Nesting is recursive, alternating between sequential and parallel. The top level is sequential, a nested array runs its entries in parallel, and an array nested inside a parallel group is a sequential chain running alongside its siblings:

```ts
const system = createSystem([
  postgres,
  [
    [migrate, emailListener], // migrate, then the email listener, in parallel with the sms listener
    smsListener,
  ],
  httpServer,
]);
```

Reversal applies at every level on stop, so a nested sequential chain stops in reverse order while its siblings stop alongside it.

If an entry of a group fails to start, the group is allowed to settle before the error propagates, so cotillion always knows which components started and can stop them later. If more than one entry fails, the operation rejects with an `AggregateError` containing every failure.

## Errors

| Error          | Thrown when                                                                                                                      |
|----------------|----------------------------------------------------------------------------------------------------------------------------------|
| Error          | The component array is invalid: a missing or duplicate name, or a malformed component. Thrown by createSystem.                   |
| TimeoutError   | The overall timeout expired, or a component exceeded its own timeout. The message names the component, or components, concerned. |
| AbortError     | abort() was called while a start or stop was in progress. The message names the component, or components, in flight.             |
| AggregateError | More than one entry of a parallel group failed. Contains every failure.                                                          |

A component's own error passes through unwrapped, so your existing error handling keeps working.

## License

MIT
