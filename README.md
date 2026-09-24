# cotillion

Graceful orchestration of network components.

![An engraving of an 18th century cotillion: four couples dancing a figure while musicians play from a gallery](assets/the-cotillion-dance.jpg)

*The Cotillion Dance, engraved by James Caldwall after John Collet, 1771. [Yale Center for British Art, CC0](https://commons.wikimedia.org/wiki/File:James_Caldwall_-_The_Cotillion_Dance_-_B1977.14.11242_-_Yale_Center_for_British_Art.jpg).*

A cotillion is a formal group dance of the 18th century, performed in figures called in strict order. This library calls the figures for your application's network components: database clients, queue listeners, HTTP servers. You supply a definition: an array of named component definitions with asynchronous start and stop functions. Cotillion starts them in the order you declare, sequentially or in parallel groups, stops them in the reverse order, bounds starting and stopping with timeouts, and stops cleanly when a start is interrupted.

## Contents

- [The problem](#the-problem)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Defining components](#defining-components)
- [Starting and stopping](#starting-and-stopping)
- [Components](#components)
- [Events](#events)
- [Timeouts](#timeouts)
- [Stopping during a start](#stopping-during-a-start)
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

1. Each component definition has a unique name and asynchronous start and stop functions.
2. The array defines the order. Nested arrays form groups which run in parallel.
3. Starting the system runs the start functions in the declared order, sequentially or in parallel groups, bounded by the system's start timeout where one is set, and resolves to an object holding the components those functions produced, keyed by name. Each start function is given the components which had started before it, so one component can take another from there.
4. Stopping the system runs the stop functions in the reverse order, bounded by the system's stop timeout where one is set.
5. Stopping the system while it is starting interrupts the start: components which can be aborted are told to, the rest are waited for, and the components not yet reached are skipped.
6. The system is an event emitter, announcing the progress of each component and of each operation as a whole.

How an individual component honours an interruption is up to the implementor. Cotillion passes each start function an [AbortSignal](https://nodejs.org/api/globals.html#class-abortsignal) which fires when the start is interrupted, if the component's definition declares it abortable, and the component uses it to release what it has acquired. A component which does not declare itself abortable is never interrupted: cotillion waits for its start to finish, or to fail, before stopping.

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

let client: pg.Client | undefined;

export const postgres = {
  name: 'postgres',
  async start() {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return client;
  },
  async stop() {
    await client?.end();
    client = undefined;
  },
};
```

**components/http-server.ts**

```ts
import { createServer, type Server } from 'node:http';
import type pg from 'pg';
import { handle } from '../handle.ts';

let server: Server;

export const httpServer = {
  name: 'httpServer',
  async start({ postgres }: { postgres: pg.Client }) {
    server = createServer((req, res) => handle(req, res, postgres));
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

const system = createSystem([postgres, httpServer], { timeout: { start: 30000, stop: 10000 } });

system.on('component_start_succeeded', ({ name }) => console.log(`${name} started`));
system.on('component_stop_succeeded', ({ name }) => console.log(`${name} stopped`));
system.on('component_start_failed', ({ name, error }) => console.error(`${name} failed to start`, error));
system.on('component_stop_failed', ({ name, error }) => console.error(`${name} failed to stop`, error));

system.on('system_start_failed', () => { process.exitCode = 1; });
system.on('system_stop_succeeded', () => process.exit());
system.on('system_stop_failed', () => process.exit(1));

system.stopOn('SIGTERM', 'SIGINT');

const { postgres: client, httpServer: server } = await system.start();

await client.query('select 1');
console.log('listening', server.address());
```

The entrypoint is a list of component definitions in order, and each component comes back from `system.start`, keyed by name. Each start function is also given the components which had started before it, keyed the same way, so the HTTP server takes the postgres client from its first argument. It is typed as a connected client rather than one which might not exist yet, and the declared order makes that so: postgres starts before the HTTP server and stops after it, so every request finds a connected client.

The wiring can equally stay in plain code, done by the module system. A definition is a plain object, so it can expose the component its start created through a getter, and the HTTP server imports the definition and reads the getter as each request arrives, ignoring the components it was given:

```ts
export const postgres = {
  name: 'postgres',
  get component(): pg.Client {
    if (!client) throw new Error('postgres has not started');
    return client;
  },
  async start() {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return client;
  },
  async stop() {
    await client?.end();
    client = undefined;
  },
};
```

```ts
import { postgres } from './postgres.ts';

export const httpServer = {
  name: 'httpServer',
  async start() {
    server = createServer((req, res) => handle(req, res, postgres.component));
    await new Promise<void>((resolve, reject) => server.listen(3000).once('listening', resolve).once('error', reject));
    return server;
  },
  async stop() {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  },
};
```

The getter throws if read before postgres has started, which the declared order rules out. Both styles give the same system; choose per component, and mix them freely.

## Defining components

A component is whatever your start function produces: a connected database client, a subscribed queue listener, a listening HTTP server. You do not hand cotillion those. You hand it a definition of each one, which is a plain object:

```ts
import type { Components } from 'cotillion';

const emailListener = {
  name: 'email-listener',
  abortable: true,
  timeout: { start: 5000, stop: 30000 },
  async start(components: Components, signal: AbortSignal) {
    // acquire connections, subscribe, listen
  },
  async stop() {
    // drain, unsubscribe, disconnect
  },
};
```

- `name` is required and must be unique within the system. It keys the object of [components](#components), identifies the component in [events](#events), and appears in error messages so you can see which component failed, timed out or was aborted. Uniqueness is validated when the system is created.
- `start` and `stop` are optional; a missing function is skipped. `start` receives two arguments: the [components](#components) which had started before it, keyed by name, and an AbortSignal, described under [Stopping during a start](#stopping-during-a-start), which only ever fires if the component is abortable. `stop` receives nothing. Whatever start returns is the component, and is collected into the object `start()` resolves to.
- `abortable` is optional and defaults to false. It declares that the start function observes its signal and settles promptly once the signal fires, so a stop which interrupts the start can abort this component rather than wait for it. Cotillion cannot tell whether a start observes its signal, so declare it only when it does.
- `timeout` is optional: a number of milliseconds bounding both start and stop, or an object with `start` and `stop` keys, either omissible. There are no defaults; see [Component timeouts](#component-timeouts).

Cotillion imposes nothing else. Components hold their own state, and a component which depends on another either takes it from the components its start is given, or reaches it in plain code and ignores that argument; the [quick start](#quick-start) shows both. A definition is a plain object, so it can carry whatever else its module wants to expose, such as the `component` getter in the second of those. The array of definitions, nested groups and all, is the system definition, and it is the first argument `createSystem` takes; the second, optional, carries the system's [timeouts](#timeouts).

## Starting and stopping

`createSystem(definition, options)` validates the definition eagerly: missing names, duplicate names and malformed entries are rejected at construction, not at start. The options carry the system's [timeouts](#timeouts) and may be omitted.

`system.start()` starts each component sequentially and, when the last one has started, resolves to the object of [components](#components). If a component's start rejects, cotillion stops the system: the components not yet reached are skipped, `system_start_failed` announces the failure, the components which had started are stopped in reverse order under the system's stop timeout, and only once that stop has finished does `start()` reject with the component's error. The stop announces itself through the same [system events](#system-events) as any other, so an exit listener sees it, and the caller has nothing left to clean up.

`system.stop()` stops the started components sequentially in reverse order and resolves when the last one has stopped. If a component's stop rejects, the error propagates and earlier components are not stopped: there is nothing further cotillion can safely do. A subsequent `stop()` retries from where the failed or timed-out one left off, stopping only the components which have not yet stopped. Calling `stop()` while the system is starting interrupts the start, described under [Stopping during a start](#stopping-during-a-start).

Both operations are idempotent. Starting a system which is already started has no effect, resolving to the existing components; stopping a system which is already stopped, or was never started, has no effect, resolving immediately. Calling an operation which is already in progress joins it rather than beginning it again. Starting while a stop is in progress, or after a stop which failed, does not begin a start either: until a stop has succeeded, `start()` returns the previous start's promise, resolved or rejected as it was. A caller who wants the system up again awaits the stop, or calls `restart()`. The exception is a stop of a system which was never started, which has no previous start to hand back: a `start()` called while that stop is in progress begins once it has finished.

An operation with nothing to do is still an operation, and announces itself as one: it emits its [system events](#system-events) and skips every component, so a listener sees the operation whether or not there was anything for it to run. Only a call which joins an operation already in progress, or which returns the previous start while a stop is pending, is silent, because it is not an operation of its own. This is what makes exiting from a `system_stop_succeeded` listener safe: however many times, and from wherever, `stop()` is called, each call announces a stop which succeeded.

A stopped system can be started again, and `system.restart()` is the convenient composition: a stop followed by a start, each under its own timeout, resolving to the fresh components. Restarting a system which is stopped, or was never started, simply starts it.

## Components

Whatever a start function returns is the component it produced, and they are collected into an object literal, keyed by name, which `start()` resolves to:

```ts
const { postgres, httpServer } = await system.start();
await postgres.query('select 1');
```

Every name appears in the object; a definition with no start function, or whose start returned nothing, appears with the value `undefined`. The object is unordered by intent: sequencing is the definition's job, and the object exists so the caller can reach what starting created, such as a connected database client. It is also why names must be unique, which is validated when the system is created. Any string is a valid name; one which is also a valid identifier destructures as above, and the rest are reachable by index access.

In TypeScript the object is typed: each property has whatever type its start function resolved to, inferred from the definition passed to `createSystem`, so the destructured `postgres` above is a `pg.Client` without a cast.

The same object, as it stood when a start began, is the first argument that start receives: a frozen snapshot of the components which had started before it, with every earlier name present, and `undefined` for a definition with no start function or whose start returned nothing. A component never sees one which started after it, and the entries of a [parallel group](#parallel-groups) receive the snapshot taken before the group began, so siblings do not see each other. This is the whole of cotillion's dependency injection: no container, no registration, and no mapping layer, so a component which wants another reaches it by the name its definition gave it, exactly as the caller of `start()` does.

## Events

A system is an [EventEmitter](https://nodejs.org/api/events.html#class-eventemitter). Component events announce each component's progress; system events announce each operation as a whole. The names follow one pattern, so they are guessable: the scope (`component_` or `system_`), the operation (`start` or `stop`), then what happened. Events are notifications for logging, diagnostics and exit handling: they do not alter the promise contract, and listening to none of them is fine.

### Component events

| Event                     | Emitted when                                                                                                                                                            | Payload      |
|---------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| component_start_initiated | A component's start has been initiated                                                                                                                                  | name         |
| component_start_succeeded | A component's start has resolved                                                                                                                                        | name         |
| component_start_failed    | A component's start rejected                                                                                                                                            | name, error  |
| component_start_skipped   | A component's start was never attempted, because it had already started, an earlier component failed, the system was stopped or its start timeout expired while it was starting, or the component has no start function | name, reason |
| component_start_aborted   | Cotillion aborted the component's start, because the system was stopped or its start timeout expired while the component was starting, and the component honoured its signal | name, reason |
| component_stop_initiated  | A component's stop has been initiated                                                                                                                                   | name         |
| component_stop_succeeded  | A component's stop has resolved                                                                                                                                         | name         |
| component_stop_failed     | A component's stop rejected                                                                                                                                             | name, error  |
| component_stop_skipped    | A component's stop was never attempted, because it is not started, an earlier start failed or was aborted, another component's stop failed, the stop timeout expired, or the component has no stop function | name, reason |

Every component event listener receives a single payload object. `name` is the component's name, `error` is the component's own error, and `reason` is one of `'timeout'`, `'abort'`, `'failure'`, `'missing'`, `'started'` or `'stopped'`.

Both operations account for every component, not only the ones they ran: each component receives exactly one of its events per operation. A stop announces `component_stop_skipped` for the components it will not stop, in stop order, before stopping the ones which are standing, so a shutdown trace names every component whether the system was fully started, partly started or never started at all. Stopping a component which never started is never attempted, because a stop function is written against what its start created.

`'started'` and `'stopped'` are states rather than histories: a component is skipped as `'stopped'` whether it never started or has since stopped, and skipped as `'started'` when a start finds it already standing. A system which has already stopped therefore announces exactly what a system which never started announces, which is what the two being the same state should mean.

### System events

| Event                  | Emitted when                                             | Payload |
|------------------------|----------------------------------------------------------|---------|
| system_start_initiated | A start has been initiated                               |         |
| system_start_succeeded | Every component started                                  |         |
| system_start_failed    | The start rejected, whether a component failed or the start timed out | error   |
| system_stop_initiated  | A stop has been initiated                                |         |
| system_stop_succeeded  | Every started component stopped                          |         |
| system_stop_failed     | The stop rejected, whether failed or timed out           | error   |

The failed system events receive the operation's error, the same one its promise rejects with. The others carry no payload.

```ts
system.on('component_start_failed', ({ name, error }) => logger.error(`${name} failed to start`, error));
system.on('system_stop_succeeded', () => process.exit());
```

The names are also exported as `ComponentEvent` and `SystemEvent`, mirroring the two tables above, so you can reach them through your editor rather than remembering them:

```ts
import { ComponentEvent, SystemEvent } from 'cotillion';

system.on(ComponentEvent.StartFailed, ({ name, error }) => logger.error(`${name} failed to start`, error));
system.on(SystemEvent.StopSucceeded, () => process.exit());
```

The two forms are interchangeable, and the rest of this README uses the string literals.

Entries of a parallel group emit individually, so listeners observe the interleaving. The aborted event announces a component whose start was interrupted and which honoured its signal; a component which completes its start regardless is announced as succeeded, because it is up and will be stopped. No event is named `error`, deliberately: Node.js throws when an `error` event has no listener, and no cotillion listener is ever mandatory.

## Timeouts

A system may be given a timeout for starting and one for stopping, in milliseconds, when it is created:

```ts
const system = createSystem(definition, { timeout: { start: 30000, stop: 10000 } });
```

A number bounds both operations; the object form bounds them separately, and either may be omitted. Omitting a timeout means cotillion waits for as long as the components take.

The start timeout covers the whole start, not each component. When it expires cotillion stops the system, exactly as it does when a component fails to start: the in-flight components which are abortable are told to abort and the rest are waited for, the components not yet reached are skipped, the components which started are stopped, and `start()` rejects with a `TimeoutError` naming the component, or components, it was waiting for.

The stop timeout covers the whole stop, whoever began it, including waiting out a start the stop interrupted. It is the only bound on a shutdown: cotillion never aborts a stop, a stop function is left to finish, and without a stop timeout a stop function which hangs, hangs. When the timeout expires, the component in flight is deemed to have timed out, which is a failure: its failed event carries a `TimeoutError` naming it, the components not yet reached are skipped, and `stop()` rejects with the same error. The component's own promise runs on unobserved, and nothing further is announced for it. This is what bounds a shutdown which must finish before an orchestrator's grace period expires, whatever a component does.

### Component timeouts

A component may also declare its own timeout, bounding each invocation of its start and stop:

```ts
const emailListener = {
  name: 'email-listener',
  timeout: { start: 5000, stop: 30000 },
  // ...
};
```

A number bounds both functions; the object form bounds them separately, and either key may be omitted. There are no defaults: a component without a timeout is bounded only by the system's timeouts.

A component exceeding its own timeout has **failed**: the invocation is deemed to have timed out, its failed event carries a `TimeoutError` such as "The component emailListener timed out after 5000ms while starting", and the operation fails fast exactly as if the component had rejected of its own accord: the components not yet reached are skipped with reason `failure`, and a failed start is followed by the automatic stop. The invocation itself runs on unobserved. An abortable component's start signal fires as well, with the same error as its reason, so it can release what it had acquired; a component which is not abortable is simply left behind, and its stop is never interrupted.

Both kinds of timeout apply at once, and whichever bound is sooner wins. The errors tell them apart: a component's names the component, the system's names the operation and the components it was waiting for. A component's own timer keeps running while the system waits out its start after the system's timeout expired, so a component which ignores its signal can still be failed by its own bound before the stop timeout deems it.

## Stopping during a start

Calling `stop()` while the system is starting interrupts the start. Cotillion fires the signal of each in-flight component which declared itself `abortable`, and waits for it to settle: a component which rejects has honoured the abort and is announced as `component_start_aborted`; one which resolves regardless is up, is announced as `component_start_succeeded`, and will be stopped. A component which did not declare itself abortable is never interrupted: cotillion waits for its start to finish or to fail. The components not yet reached are skipped, and the stop proceeds through whatever started, in reverse order, announcing its outcome as any stop does.

An interrupted start is not a failure: the caller asked for a stop and is getting one, exactly as if the system had finished starting first. It announces no outcome of its own, so the events tell it in the order it happened: `system_stop_initiated` as soon as `stop()` is called, the aborted, succeeded and skipped component events as the start winds down, then the component stops, then `system_stop_succeeded` or `system_stop_failed`. The `start()` promise still has to settle, and there are no components to resolve it with, so once the stop has finished, whatever its outcome, it rejects with an `AbortError` naming the components whose start was in flight. The order matters: the stop's outcome event fires first, so when the stop was a termination signal the exit listener has ended the process before the rejection is delivered, and a top-level `await system.start()` needs no handling of its own. An application which stops a starting system without exiting should expect the `AbortError` at its await. The same error is the reason an abortable component's signal carries, so a component which propagates it can tell an abort from its own failures.

The stop timeout bounds the whole of this, waiting out the interrupted start included. A component which ignores its signal, or was never abortable, and has not finished when the stop timeout expires is deemed to have timed out, as described under [Timeouts](#timeouts): its `component_start_failed` carries the `TimeoutError`, `stop()` rejects with it, and `start()` still resolves once that stop has settled, because the timeout is the stop's failure, not the start's.

There is no other way to interrupt an operation: no `abort()`, and a stop is never aborted, because a stop cut short leaves a component half released. The motivating case is the termination signal which arrives while a deploy is still starting, and [stopping on process events](#process-events) wires it up for you.

## Process events

`system.stopOn(...events)` stops the system when the process emits any of the given events, so you do not have to wire shutdown handlers yourself:

```ts
system.stopOn('SIGTERM', 'SIGINT');
```

The events are explicit: cotillion does not presume which process events mean shutdown in your deployment. Termination signals are the usual choice, but any process event will do. The first to arrive stops the system, bounded by the system's stop timeout. Further events change nothing while that stop is in progress: they join it, and its timeout is what bounds it. The listeners stay bound for the life of the process, so an event after a `restart()` stops the restarted system too.

Cotillion does not call `process.exit`, and does not presume your exit codes. The stop's outcome arrives as a [system event](#system-events), so exiting stays in your hands:

```ts
system.on('system_start_failed', () => { process.exitCode = 1; });
system.on('system_stop_succeeded', () => process.exit());
system.on('system_stop_failed', () => process.exit(1));
```

The first line matters. A start which fails stops the system, and that stop usually succeeds, so a `system_stop_succeeded` listener which exits with 0 would report a deploy whose database never connected as a success. Setting the exit code when the start fails, and letting the stop's listener exit with whatever code is set, gets both cases right.

Call `stopOn` before starting, as in the [quick start](#quick-start): a termination signal can arrive while the system is still starting. An event received mid-start interrupts the start as described under [Stopping during a start](#stopping-during-a-start), then stops whatever had started, announcing the outcome through the same system events; the `start()` a caller is awaiting rejects with an `AbortError` only once that stop has finished, by which time the exit listener has ended the process, so a top-level `await system.start()` needs no handling of its own. An event received before any operation stops a never-started system, which resolves, and announces `system_stop_succeeded`, immediately.

With the exit listeners wired, `start()` never rejects into your code at all, for a failed component either, because the stop which follows announces its outcome, and the listener exits, before the rejection is delivered. Log a failed start from a `component_start_failed` or `system_start_failed` listener, then, rather than from a catch. A catch around `start()` is reached only in a process which does not exit from its listeners, such as a test or an embedded use, and there it should expect an `AbortError` as well as a component's own error.

`stopOn` returns a function which unbinds the listeners again. It validates its arguments eagerly: at least one event, each a string.

A stop begun by a process event has no caller to receive its outcome, so it announces the outcome only through the system events, and never as an unhandled rejection: a stop which fails or times out after a termination signal reaches your `system_stop_failed` listener and nothing else.

## Parallel groups

A nested array is a parallel group. Its entries start concurrently, and the group counts as one step in the enclosing sequence: the next component does not start until every entry of the group has started.

```ts
const system = createSystem([
  postgres,
  [emailListener, smsListener, pushListener],
  httpServer,
]);
```

On stop, order reverses around the group: `httpServer` stops first, then the three listeners stop concurrently, then `postgres`. Each listener's start is given the components which had started before the group, here `postgres` alone, and `httpServer` is given all four.

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

If an entry of a group fails to start, the group is allowed to settle before the system is stopped and the error propagates, so cotillion always knows which components started and stops exactly those. If more than one entry fails, the operation rejects with an `AggregateError` containing every failure.

## Errors

| Error          | Thrown when                                                                                                                      |
|----------------|----------------------------------------------------------------------------------------------------------------------------------|
| Error          | The definition or the options are invalid: a missing or duplicate name, a malformed entry, or a malformed timeout. Thrown by createSystem. Also thrown by stopOn given no events, or one which is not a string. |
| TimeoutError   | The system's start or stop timeout expired, or a component exceeded its own timeout. The message names the component, or components, concerned. |
| AbortError     | A stop interrupted the start. Thrown by start() once the stop has finished, and carried as the reason of each abortable component's signal; the message names the components whose start was in flight. |
| AggregateError | More than one entry of a parallel group failed. Contains every failure.                                                          |

A component's own error passes through unwrapped, so your existing error handling keeps working.

## License

MIT
