# cotillion

<!--
[![NPM Version](https://img.shields.io/npm/v/cotillion)](https://www.npmjs.com/package/cotillion)
[![CI](https://github.com/acuminous/cotillion/actions/workflows/qa.yml/badge.svg)](https://github.com/acuminous/cotillion/actions/workflows/qa.yml)
[![Coverage](https://codecov.io/gh/acuminous/cotillion/branch/main/graph/badge.svg)](https://codecov.io/gh/acuminous/cotillion)
[![Node.js](https://img.shields.io/node/v/cotillion)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/cotillion)](LICENSE)
-->

Cotillion is a module for the graceful orchestration of network components (database clients, http servers, etc). Applications depend on network components which must start in order and stop in reverse: the HTTP server must not accept requests before the database is connected, and the database must not disconnect while the queue listener is mid-message. Startup code usually gets this right. Graceful shutdown is often forgotten, and it is where the awkward cases live: a stop which hangs, an orchestrator's grace period, a second termination signal.

Cotillion does the lifecycle and nothing else. You give it an array of components, each with a name and asynchronous start and stop functions. It starts them in order, stops them in reverse, applies timeouts, handles termination signals, and emits events you can log or exit on. Components which may start together go in a nested array.

## Contents

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

## Installation

```sh
npm install cotillion
```

Requirements:

- Node.js 22 or later

Cotillion has no production dependencies.

## Quick start

The entrypoint lists the components in start order, wires the exit, and starts the system.

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

Each component lives in its own file, behind the same small shape: a name, a start which returns the component, and a stop.

**components/postgres.ts**

```ts
import type { ComponentDefinition } from 'cotillion';
import pg from 'pg';

let client: pg.Client | undefined;

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

**components/http-server.ts**

```ts
import { createServer, type Server } from 'node:http';
import type { ComponentDefinition } from 'cotillion';
import { handle } from '../handle.ts';
import { postgres } from './postgres.ts';

let server: Server | undefined;

export const httpServer = {
  name: 'httpServer',
  get component(): Server {
    if (!server) throw new Error('httpServer has not started');
    return server;
  },
  async start() {
    server = createServer((req, res) => handle(req, res, postgres.component));
    await new Promise<void>((resolve, reject) => server.listen(3000).once('listening', resolve).once('error', reject));
    return server;
  },
  async stop() {
    await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
    server = undefined;
  },
} as const satisfies ComponentDefinition;
```

The system's `start()` resolves to the components, keyed by name. Other parts of the application can get a reference to a component once it has started in two ways. The first is the `component` getter each definition exposes: import the definition and read the getter, as the HTTP server does with postgres. The getter throws if read before the component has started, which the declared order rules out for anything started after it. The second is the object passed to each component's start method, holding the components which started before it: `async start({ postgres }: { postgres: pg.Client })`.

## Defining components

A component is whatever your start function produces: a connected client, a subscribed listener, a listening server. You give cotillion a definition of each one, which is a plain object:

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

- `name` is required and must be unique. It is the component's key in the components object, and identifies the component in events and error messages.
- `start` is optional. It is called with two arguments: an object holding the components which have already started, keyed by name, and an AbortSignal. Whatever it returns is the component. Without a start function the component is `undefined`.
- `stop` is optional. It is called with no arguments.
- `abortable` is optional and defaults to false. Set it to true only if the start function watches its signal and gives up promptly when the signal fires. See [Stopping during a start](#stopping-during-a-start).
- `timeouts` is optional. It limits how long this component's own start and stop may take, in milliseconds: a number for both, or an object with `start` and `stop` keys. See [Component timeouts](#component-timeouts).

The definition may have other properties too, such as the `component` getter in the quick start. Pass the array of definitions to `createSystem` as its first argument, and the system's options as its second.

## Starting and stopping

`createSystem(definition, options)` validates the definition and rejects a malformed one at construction, before anything starts.

`start()` starts the components in order and resolves to them, keyed by name. If a component fails to start, cotillion stops the ones which had started, then `start()` rejects with the component's error.

`stop()` stops the started components in reverse order. If a component fails to stop, `stop()` rejects with its error and the earlier components are left running; calling `stop()` again retries from where it left off.

`restart()` is a stop followed by a start, resolving to the fresh components.

Both operations are idempotent: starting a started system, or stopping a stopped one, does nothing, and a call made while the same operation is in progress joins it. The corner case behaviour, such as stopping while the system is starting, is documented in the [feature tests](https://github.com/acuminous/cotillion/tree/main/test/features).

## Components

`start()` resolves to an object with one property per component, keyed by the definition's name and holding whatever the start function returned:

```ts
const { postgres, httpServer } = await system.start();
await postgres.query('select 1');
```

A component whose definition has no start function, or whose start function returned nothing, is `undefined`.

In TypeScript each component has the type its start function resolved to, so the destructured `postgres` above is a `pg.Client` without a cast. For that to work on a definition declared in its own module, end it with `as const satisfies ComponentDefinition`, as the quick start does; a bare exported object literal loses the property names.

The same object is passed to each start function as its first argument, holding the components which had started by then. It is a frozen copy taken when the start begins, so a component sees only the components which started before it, never those which started after. The components in a [parallel group](#parallel-groups) see what started before the group, not each other.

## Events

A system is an [EventEmitter](https://nodejs.org/api/events.html#class-eventemitter). It emits a component event each time a component starts, stops, fails or is skipped, and a system event when a start or a stop begins and when it finishes. Use them to log the lifecycle and to exit the process. Nothing depends on your listening to them.

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

Component event listeners receive a single object. `name` is the component's name. `error` is the error the component's function threw. `reason` says why a component was skipped or aborted: `'timeout'`, `'abort'`, `'failure'` (an earlier component failed), `'missing'` (no function), `'started'` (already started) or `'stopped'` (already stopped).

Every operation announces every component, including the ones it does not run, so a shutdown trace always names every component.

### System events

| Event                  | Emitted when                                             | Payload |
|------------------------|----------------------------------------------------------|---------|
| system_start_initiated | A start has been initiated                               |         |
| system_start_succeeded | Every component started                                  |         |
| system_start_failed    | The start rejected, whether a component failed or the start timed out | error   |
| system_stop_initiated  | A stop has been initiated                                |         |
| system_stop_succeeded  | Every started component stopped                          |         |
| system_stop_failed     | The stop rejected, whether failed or timed out           | error   |

The two failed events receive the error the operation rejected with. The others have no payload.

The event names are exported as the constants `ComponentEvent` and `SystemEvent`, used throughout this README. The string names in the tables work just as well:

```ts
system.on('component_start_failed', ({ name, error }) => logger.error(`${name} failed to start`, error));
system.on('system_stop_succeeded', () => process.exit());
```

No event is named `error`, so Node.js never throws for a missing listener.

## Timeouts

You can limit how long a start and a stop may take, in milliseconds:

```ts
const system = createSystem(definition, { timeouts: { start: 30000, stop: 10000 } });
```

A number applies the same limit to both. The object form sets them separately, and either may be left out, in which case there is no limit.

If the start takes longer than its limit, cotillion stops the components which had started, and `start()` rejects with a `TimeoutError` naming the component it was waiting for. A component which is still starting is aborted if it is abortable, and waited for if it is not.

If the stop takes longer than its limit, `stop()` rejects with a `TimeoutError` naming the component it was waiting for. Cotillion never interrupts a stop function; the component is treated as having failed to stop, and its function is left running. This limit is what keeps a shutdown within an orchestrator's grace period, whatever a component does.

### Component timeouts

A component can also limit its own start and stop:

```ts
const emailListener = {
  name: 'email-listener',
  timeouts: { start: 5000, stop: 30000 },
  // ...
};
```

A number applies to both; the object form sets them separately. There are no defaults.

A component which exceeds its own limit is treated as if its function had thrown: its failed event carries a `TimeoutError` such as "The component emailListener timed out after 5000ms while starting", the operation continues as after any failure, and the function is left running. If the component is abortable, its start signal fires as well. When a component limit and a system limit are both set, whichever expires first applies.

## Stopping during a start

Calling `stop()` while the system is starting interrupts the start:

- A component whose start is in progress and which is `abortable` has its signal fired. If it then rejects, it is announced as `component_start_aborted`. If it resolves anyway, it is announced as started and will be stopped.
- A component whose start is in progress and which is not abortable is waited for.
- Components not yet reached are skipped.

The components which did start are then stopped in reverse order, as in any stop. Once the stop has finished, `start()` rejects with an `AbortError` naming the components whose start was interrupted. An interrupted start is not a failure, so no `system_start_failed` event is emitted; the stop's events tell the story.

Because `start()` rejects only after the stop has finished, a listener which exits the process on `system_stop_succeeded` has ended the process before the rejection arrives. Only an application which stops a starting system without exiting sees the `AbortError`, at its `await`.

The stop timeout applies to the whole stop, including the wait for an interrupted start. A stop is never itself interrupted, because a stop cut short leaves a component half released.

## Process events

`system.stopOn(...events)` calls `stop()` when the process emits any of the named events:

```ts
system.stopOn('SIGTERM', 'SIGINT');
```

Use it for the termination signals your platform sends. Further events during the stop do nothing more. The listeners stay for the life of the process, so a signal after a `restart()` stops the restarted system. `stopOn` returns a function which removes the listeners.

Cotillion never calls `process.exit`. Add listeners to exit when the stop has finished:

```ts
system.on(SystemEvent.StartFailed, () => { process.exitCode = 1; });
system.on(SystemEvent.StopSucceeded, () => process.exit());
system.on(SystemEvent.StopFailed, () => process.exit(1));
```

The first line matters. When a start fails, cotillion stops the system, and that stop usually succeeds; without the first line the process would exit with code 0 after a failed start.

Call `stopOn` before `start()`, so that a signal arriving during startup interrupts it. In that case `start()` rejects with an `AbortError`, but only after the stop has finished, by which time the exit listener has ended the process. With these listeners in place, `start()` never rejects into your code, so log start failures from the event listeners rather than from a catch block.

A stop begun by a process event reports its outcome only through the system events. Its failure is never an unhandled rejection.

## Parallel groups

Put components in a nested array to start them at the same time:

```ts
const system = createSystem([
  postgres,
  [emailListener, smsListener, pushListener],
  httpServer,
]);
```

The group counts as one step: `httpServer` starts once all three listeners have started. On stop the order reverses: `httpServer` stops first, then the three listeners at the same time, then `postgres`. Each listener's start receives the components which started before the group, here `postgres` alone; `httpServer` receives all four.

Nested arrays alternate. An array inside a group runs its entries in sequence, alongside the group's other entries:

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

Here `migrate` and then `emailListener` run in sequence while `smsListener` runs alongside them. Stopping reverses the order at every level.

If a component in a group fails to start, the rest of the group is allowed to finish first, so cotillion knows exactly which components started and stops those. One failure is rethrown as it is. Two or more are combined into an `AggregateError` whose message names the components, for example "The components emailListener and smsListener failed to start". Failures while stopping a group are handled the same way.

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
