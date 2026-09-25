# cotillion

<!--
[![NPM Version](https://img.shields.io/npm/v/cotillion)](https://www.npmjs.com/package/cotillion)
[![CI](https://github.com/acuminous/cotillion/actions/workflows/qa.yml/badge.svg)](https://github.com/acuminous/cotillion/actions/workflows/qa.yml)
[![Coverage](https://codecov.io/gh/acuminous/cotillion/branch/main/graph/badge.svg)](https://codecov.io/gh/acuminous/cotillion)
[![Node.js](https://img.shields.io/node/v/cotillion)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/cotillion)](LICENSE)
-->

Graceful orchestration of network components (database clients, http servers, etc).

Applications depend on network components which must start in order and stop in reverse: the HTTP server must not accept requests before the database is connected, and the database must not disconnect while the queue listener is mid-message. Startup code usually gets this right. Graceful shutdown is usually forgotten, and it is where the awkward cases live: a stop which hangs, an orchestrator's grace period, a second termination signal.

Cotillion is the lifecycle and nothing else. You hand it a definition: an array of named components with asynchronous start and stop functions, nested where they may run in parallel. It starts them in order and resolves to what they produced, keyed by name; stops them in reverse; bounds each operation, and each component, with timeouts; interrupts a start cleanly when a stop or a termination signal arrives midway; and announces every step as events, for logging and for exit handling. Dependency injection frameworks such as [systemic](https://github.com/onebeyond/systemic) and application frameworks such as [NestJS](https://nestjs.com/) order startup and shutdown as a side effect of wiring, at the price of a container and a registration API, and neither bounds a hook which hangs. If your wiring is plain code, cotillion is all you are missing.

## Contents

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
- [The name](#the-name)

## How it works

You define components, list them in start order, and create a system.

1. A component definition has a unique name and asynchronous start and stop functions.
2. The array is the order. A nested array is a group whose entries run in parallel.
3. Starting runs the start functions in order and resolves to the components they produced, keyed by name. Each start is given the components which started before it.
4. Stopping runs the stop functions in reverse.
5. Both are bounded by the system's timeouts. Stopping mid-start interrupts the start: abortable components are signalled, the rest are waited for, and the unreached are skipped.
6. The system is an EventEmitter, announcing every component and every operation.

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
import type { ComponentDefinition } from 'cotillion';
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
} as const satisfies ComponentDefinition;
```

**components/http-server.ts**

```ts
import { createServer, type Server } from 'node:http';
import type { ComponentDefinition } from 'cotillion';
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
} as const satisfies ComponentDefinition;
```

**index.ts**

```ts
import { ComponentEvent, SystemEvent, createSystem } from 'cotillion';
import { postgres } from './components/postgres.ts';
import { httpServer } from './components/http-server.ts';

const system = createSystem([postgres, httpServer], { timeouts: { start: 30000, stop: 10000 } });

system.on(ComponentEvent.StartSucceeded, ({ name }) => console.log(`${name} started`));
system.on(ComponentEvent.StopSucceeded, ({ name }) => console.log(`${name} stopped`));
system.on(ComponentEvent.StartFailed, ({ name, error }) => console.error(`${name} failed to start`, error));
system.on(ComponentEvent.StopFailed, ({ name, error }) => console.error(`${name} failed to stop`, error));

system.on(SystemEvent.StartFailed, () => { process.exitCode = 1; });
system.on(SystemEvent.StopSucceeded, () => process.exit());
system.on(SystemEvent.StopFailed, () => process.exit(1));

system.stopOn('SIGTERM', 'SIGINT');

const { postgres: client, httpServer: server } = await system.start();

await client.query('select 1');
console.log('listening', server.address());
```

The entrypoint is a list of definitions in order. The components come back from `start()` keyed by name, and each start is given the components which started before it, which is how the HTTP server gets its postgres client: typed as a connected one, because the declared order makes it so.

Wiring can also stay in plain code. A definition is a plain object, so it can expose what its start created through a getter, and another module can import it:

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
} as const satisfies ComponentDefinition;
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
} as const satisfies ComponentDefinition;
```

The getter throws if read before postgres has started, which the order rules out. Mix the two styles freely.

## Defining components

A component is whatever your start function produces: a connected client, a subscribed listener, a listening server. You hand cotillion a definition of each one, a plain object:

```ts
import type { Components } from 'cotillion';

const emailListener = {
  name: 'email-listener',
  abortable: true,
  timeouts: { start: 5000, stop: 30000 },
  async start(components: Components, signal: AbortSignal) {
    // acquire connections, subscribe, listen
  },
  async stop() {
    // drain, unsubscribe, disconnect
  },
};
```

- `name` is required and unique within the system. It keys the [components](#components), identifies the component in [events](#events) and appears in error messages.
- `start` and `stop` are optional; a missing function is skipped. `start` receives the [components](#components) which started before it and an AbortSignal which only fires if the component is abortable. `stop` receives nothing. Whatever start returns is the component.
- `abortable` defaults to false. Declare it only if the start observes its signal and settles promptly once it fires; cotillion cannot tell.
- `timeouts` bounds the component's own start and stop: a number for both, or an object with `start` and `stop` keys. There are no defaults. See [Component timeouts](#component-timeouts).

A definition may carry whatever else its module wants to expose, such as the getter above. The array of definitions, groups included, is the first argument to `createSystem`; the optional second carries the system's [timeouts](#timeouts).

## Starting and stopping

`createSystem(definition, options)` validates the definition eagerly: a missing or duplicate name, a malformed entry or a malformed timeout is rejected at construction.

`start()` runs the starts in order and resolves to the [components](#components). If one rejects, the components not yet reached are skipped, `system_start_failed` is announced, the components which started are stopped in reverse under the stop timeout, and only then does `start()` reject with the component's error. The stop announces itself like any other, so an exit listener sees it and the caller has nothing left to clean up.

`stop()` runs the stops in reverse and resolves when the last has finished. If one rejects, the error propagates and the earlier components are left alone; a later `stop()` retries from where it left off. Calling `stop()` during a start interrupts it, see [Stopping during a start](#stopping-during-a-start).

Both are idempotent. Starting a started system resolves to the existing components; stopping a stopped or never-started one resolves at once; a call which joins an operation in progress is silent. Until a stop has succeeded, `start()` returns the previous start's promise, resolved or rejected as it was: await the stop, or call `restart()`. The one exception is a start during the stop of a never-started system, which begins once that stop has finished.

An operation with nothing to do still announces itself and skips every component, so every `stop()` call announces a stop which succeeded. That is what makes exiting from a `system_stop_succeeded` listener safe.

`restart()` is a stop followed by a start, each under its own timeout, resolving to the fresh components. On a stopped system it simply starts.

## Components

Whatever a start function returns is its component, and `start()` resolves to them all, keyed by name:

```ts
const { postgres, httpServer } = await system.start();
await postgres.query('select 1');
```

Every name appears; a definition with no start, or whose start returned nothing, appears as `undefined`. Any string is a valid name, and one which is a valid identifier destructures as above.

In TypeScript each property has the type its start function resolved to, inferred from the definition. The inference keys on each definition's `name`, which stays a literal for a definition written inline or declared in its own module with `as const satisfies ComponentDefinition`, as the quick start does; a bare exported literal widens its name to `string` and the object loses its property names. The `satisfies` half also checks the definition's shape where it is written.

The same object, as it stood when a start began, is that start's first argument: a frozen snapshot of the components which started before it. A component never sees one which started after it, and the entries of a [parallel group](#parallel-groups) see what started before the group, not each other. That is the whole of cotillion's dependency injection: no container, no registration, no mapping layer.

## Events

A system is an [EventEmitter](https://nodejs.org/api/events.html#class-eventemitter), typed with its events. Component events announce each component; system events announce each operation. The names follow one pattern: the scope, the operation, then what happened. Events are notifications for logging, diagnostics and exit handling; they never alter the promise contract, and listening to none is fine.

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

Each listener receives one payload object: `name` is the component's, `error` is the component's own error, and `reason` is one of `'timeout'`, `'abort'`, `'failure'`, `'missing'`, `'started'` or `'stopped'`.

Every component receives exactly one of its events per operation, whether or not the operation ran it. A stop announces `component_stop_skipped` for the components it will not stop, in stop order, before stopping the rest, so a shutdown trace names every component. `'started'` and `'stopped'` are states, not histories: a system which has stopped announces exactly what one which never started announces.

### System events

| Event                  | Emitted when                                             | Payload |
|------------------------|----------------------------------------------------------|---------|
| system_start_initiated | A start has been initiated                               |         |
| system_start_succeeded | Every component started                                  |         |
| system_start_failed    | The start rejected, whether a component failed or the start timed out | error   |
| system_stop_initiated  | A stop has been initiated                                |         |
| system_stop_succeeded  | Every started component stopped                          |         |
| system_stop_failed     | The stop rejected, whether failed or timed out           | error   |

The failed events receive the operation's error, the same one its promise rejects with. The others carry nothing.

The constants `ComponentEvent` and `SystemEvent` carry the names in the two tables, and the string names work just as well; the two forms are interchangeable:

```ts
system.on('component_start_failed', ({ name, error }) => logger.error(`${name} failed to start`, error));
system.on('system_stop_succeeded', () => process.exit());
```

The aborted event announces a component whose start was interrupted and which honoured its signal; one which completes regardless is announced as succeeded, because it is up and will be stopped. No event is named `error`, so no listener is ever mandatory.

## Timeouts

A system may be given a start timeout and a stop timeout, in milliseconds:

```ts
const system = createSystem(definition, { timeouts: { start: 30000, stop: 10000 } });
```

A number bounds both operations; the object form bounds them separately, and either may be omitted, in which case cotillion waits as long as the components take.

The start timeout covers the whole start. When it expires cotillion stops the system, exactly as when a component fails to start: abortable components in flight are signalled, the rest waited for, the unreached skipped, the started stopped, and `start()` rejects with a `TimeoutError` naming the components it was waiting for.

The stop timeout covers the whole stop, whoever began it, including waiting out a start the stop interrupted. It is the only bound on a shutdown: cotillion never aborts a stop, so without one a stop function which hangs, hangs. When it expires the component in flight is deemed to have timed out, which is a failure: its failed event carries a `TimeoutError` naming it, the unreached are skipped, `stop()` rejects with the same error, and the component's promise runs on unobserved.

### Component timeouts

A component may also bound its own start and stop:

```ts
const emailListener = {
  name: 'email-listener',
  timeouts: { start: 5000, stop: 30000 },
  // ...
};
```

A number bounds both; the object form bounds them separately. There are no defaults.

A component exceeding its own timeout has **failed**: its failed event carries a `TimeoutError` such as "The component emailListener timed out after 5000ms while starting", the unreached are skipped with reason `failure`, a failed start is followed by the automatic stop, and the invocation runs on unobserved. An abortable component's start signal fires with the same error as its reason; a stop is never interrupted.

Both kinds of timeout apply at once and the sooner wins. Their messages tell them apart: a component's names the component, the system's names the operation and what it was waiting for. A component's own timer keeps running while the system waits out its start, so a component which ignores its signal can still be failed by its own bound.

## Stopping during a start

Calling `stop()` while the system is starting interrupts the start. Each in-flight component which declared itself `abortable` has its signal fired and is waited for: if it rejects it honoured the abort and is announced as `component_start_aborted`; if it resolves regardless it is up, announced as `component_start_succeeded`, and will be stopped. A component which is not abortable is never interrupted; cotillion waits for it to finish or fail. The unreached are skipped, then the stop proceeds through whatever started.

An interrupted start is not a failure and announces no outcome of its own. The events tell it in order: `system_stop_initiated` as soon as `stop()` is called, the component events as the start winds down, the stops, then the stop's outcome. The `start()` promise has no components to resolve with, so once the stop has finished it rejects with an `AbortError` naming the components whose start was in flight. The stop's outcome event fires first, so when the stop was a termination signal the exit listener has ended the process before the rejection is delivered, and a top-level `await system.start()` needs no handling; an application which stops a starting system without exiting should expect the `AbortError`. The same error is the reason an abortable component's signal carries.

The stop timeout bounds all of this. A component which has not finished when it expires is deemed to have timed out as described under [Timeouts](#timeouts): its `component_start_failed` carries the `TimeoutError`, `stop()` rejects with it, and `start()` still rejects with the `AbortError`.

There is no other way to interrupt an operation, and a stop is never aborted, because a stop cut short leaves a component half released. The motivating case is a termination signal during a deploy, which [process events](#process-events) wire up for you.

## Process events

`system.stopOn(...events)` stops the system when the process emits any of the given events:

```ts
system.stopOn('SIGTERM', 'SIGINT');
```

The events are explicit; any process event will do. The first to arrive stops the system under the stop timeout, and further events while that stop is in progress join it. The listeners stay bound for the life of the process, so an event after a `restart()` stops the restarted system too. `stopOn` returns a function which unbinds them, and rejects a call with no events or a non-string one.

Cotillion never calls `process.exit`. The stop's outcome arrives as a [system event](#system-events), so exiting stays in your hands:

```ts
system.on(SystemEvent.StartFailed, () => { process.exitCode = 1; });
system.on(SystemEvent.StopSucceeded, () => process.exit());
system.on(SystemEvent.StopFailed, () => process.exit(1));
```

The first line matters: a failed start stops the system, and that stop usually succeeds, so a listener which exited 0 on every successful stop would report a deploy whose database never connected as a success.

Call `stopOn` before `start()`, as the quick start does, because a signal can arrive mid-start. It then interrupts the start as described under [Stopping during a start](#stopping-during-a-start), and the `start()` a caller is awaiting rejects only once the stop has finished, by which time the exit listener has ended the process. With those listeners wired, `start()` never rejects into your code, for a failed component either, so log a failed start from a listener rather than a catch; a catch is reached only in a process which does not exit from its listeners, and should expect an `AbortError` as well as a component's own error. An event before any operation stops a never-started system and announces `system_stop_succeeded` at once.

A stop begun by a process event has no caller, so its outcome is announced only through the system events, never as an unhandled rejection.

## Parallel groups

A nested array is a parallel group: its entries start concurrently, and the group is one step in the enclosing sequence.

```ts
const system = createSystem([
  postgres,
  [emailListener, smsListener, pushListener],
  httpServer,
]);
```

On stop the order reverses around the group: `httpServer`, then the three listeners concurrently, then `postgres`. Each listener's start is given the components which started before the group, here `postgres` alone; `httpServer` is given all four.

Nesting alternates. A nested array runs in parallel, and an array inside a group is a sequence running alongside its siblings, whose members see their predecessors in that sequence:

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

Reversal applies at every level on stop.

A group settles before a failure propagates, so cotillion always knows which components started and stops exactly those. One failure propagates as itself; several as an `AggregateError` containing every one, its message naming the components: "The components emailListener and smsListener failed to start". A sequence inside a group fails fast within itself while its siblings settle. Stop failures inside a group are treated the same way. A stop or timeout which interrupts a group takes precedence over failures within it, and a timeout's message names every component in flight.

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

## The name

A cotillion is a formal group dance of the 18th century, performed in figures called in strict order. This library calls the figures for your application's network components: database clients, queue listeners, HTTP servers.

![An engraving of an 18th century cotillion: four couples dancing a figure while musicians play from a gallery](https://raw.githubusercontent.com/acuminous/cotillion/main/assets/the-cotillion-dance.jpg)

*The Cotillion Dance, engraved by James Caldwall after John Collet, 1771. [Yale Center for British Art, CC0](https://commons.wikimedia.org/wiki/File:James_Caldwall_-_The_Cotillion_Dance_-_B1977.14.11242_-_Yale_Center_for_British_Art.jpg).*
