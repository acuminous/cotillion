# Changelog

All notable changes to cotillion are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `createSystem` exists, returning a system you can start and stop (#1). A system with no
  definition starts, resolving to an object of components with no entries, and stops. The
  system is an EventEmitter and announces `system_start_initiated`, `system_start_succeeded`,
  `system_stop_initiated` and `system_stop_succeeded` around those operations, so a caller can
  already see an operation begin and end. The ordering, timeout and abort semantics the README
  specifies are not implemented yet, so there is nothing here worth depending on.

- `createSystem` validates the system definition and throws rather than returning a system
  which would fail later (#2). It checks that every entry is an object with a string name, that
  names are unique throughout the definition including inside nested groups at any depth, that start
  and stop are functions where present, that an abortable flag, where present, is a boolean, and
  that timeouts are positive numbers under the known keys. The options, where given, are checked
  the same way: a system timeout is a positive number under the start and stop keys, and an
  unknown option is rejected. The message names the offending component, or its position when it has no usable
  name, and the first violation in declaration order is the one reported. In TypeScript the
  same rules are enforced at compile time: an unknown timeout key or a start which is not a
  function will not typecheck.

- `system.start()` runs each start function in declaration order, one at a time, and resolves to
  an object of the components they produced, keyed by name (#3). A definition with no start
  function, or whose start returns nothing, appears with the value `undefined`, so every name
  is in the object, and the components are returned to the caller rather than passed to other
  components. Each start function is given an AbortSignal as its only argument, which nothing fires
  yet. Starting a started system has no effect and resolves to the same object, a start requested
  while one is in flight joins it rather than starting the components twice, and a stopped system
  starts afresh. Components inside a parallel group are not started yet, and `stop()` still stops
  nothing, so only a flat array of components is worth starting so far.

- `system.stop()` runs the stop functions of the components which started, one at a time, in the
  reverse order they started, and resolves when the last has stopped (#4). A component with no
  stop function is skipped, and each stop function is given an AbortSignal as its only argument,
  which nothing fires yet. Stopping is idempotent in the same way starting is: stopping a stopped,
  or never started, system has no effect and resolves immediately, and a stop requested while one
  is in flight joins it rather than stopping the components twice. A stop which did not finish can
  be retried, the next `stop()` picking up where the last left off and stopping only the components
  still standing. `system.restart()` is a stop followed by a start, resolving to the fresh start
  values, and restarting a stopped, or never started, system simply starts it. Neither operation
  takes options yet, so nothing bounds how long a stop will wait.

- Both operations fail fast, and a component's own error reaches the caller unwrapped (#5). If a
  component's start rejects, the later components are never attempted and the components which
  had already started stay started, so `system.stop()` afterwards is the recovery path: it stops
  exactly those, in reverse order, leaving the component which failed to start alone. If a
  component's stop rejects, the components earlier in the stop order are left untouched and the
  next `stop()` retries from where the failed one left off. Neither operation wraps, aggregates
  or replaces the error it was given, so the object your component rejected with is the object
  `start()` or `stop()` rejects with, and existing error handling keeps working.

- Every event name the README documents is exported as a constant, `ComponentEvent` and
  `SystemEvent`, mirroring the two tables in the Events section (#1). Listeners can be
  registered with either a constant or the string literal, and both are typed.

- A system announces each component as it starts and stops (#6), so you can log progress, or
  spot which component is holding a shutdown up, without instrumenting the components
  themselves. `component_start_initiated` is emitted immediately before a component's start
  function runs and `component_start_succeeded` once it resolves, `component_start_failed`
  carries the component's own error when it rejects, and `component_start_skipped` announces a
  component the start never attempted, with a `reason` of `missing` when it has no start
  function or `failure` when an earlier component failed. Stopping announces the same four
  events, reversed, and both operations account for every component rather than only the ones
  they ran, so each component gets exactly one of the five events per operation. A stop
  announces `component_stop_skipped` in stop order for every component it will not stop: with
  the reason its start did not succeed where one ran, and `stopped`, a new reason, where the
  system never started at all. A shutdown trace therefore names every component whether the
  system was fully started, partly started or never started, which is what an exit handler
  wants to log. Cotillion still never calls a stop function for a component which did not
  start, because a stop function is written against what its start created. Every listener receives one payload object, `{ name }` plus `error` or
  `reason` where the table says so. The events are notifications: a system with no listeners
  starts, stops and rejects exactly as before.

- A system announces each operation as a whole (#7), so exit handling has something to listen
  to: `system_start_failed` and `system_stop_failed` join the initiated and succeeded events
  already emitted, completing the six the README documents. The failed events carry the
  operation's error, which is the object the promise rejects with rather than a copy or a
  wrapper, so a listener and a `catch` block see the same thing. The events belong to the
  operation rather than to the call: a `start()` or `stop()` which joins one already in flight
  announces nothing further, a stop retried after one which failed announces a second pair
  because it is a second operation, and `restart()` emits the stop pair then the start pair
  rather than events of its own. The failed events will also carry the `TimeoutError` and
  `AbortError` of an operation which timed out or was aborted, which wait on #8 and #10.

- An operation with nothing to do now announces itself like any other (#7), which makes the
  README's exit idiom safe: `system.on('system_stop_succeeded', () => process.exit(0))` fires
  for every `stop()`, not only for the one which happened to have components to stop. Stopping
  a system which has already stopped emits its system events and announces every component as
  `component_stop_skipped`, exactly as stopping a never started system already did, so the two
  states the README calls the same state now look the same. Starting a system which has
  already started does the same and still resolves to the existing components object.
  `started` joins the skip reasons for that case: a start skips a component which is already
  standing, the mirror of `stopped`, which now means a component which is not standing
  rather than one which never ran. Only a call which joins an operation already in progress
  stays silent, because it is not an operation of its own. If you were relying on a second
  `stop()` being completely silent, a listener which logs or exits will now fire for it, which
  is the point.

- A system can be given a start timeout and a stop timeout when it is created (#8):
  `createSystem(definition, { timeout: { start: 30000, stop: 10000 } })`, or a single number
  bounding both, and omitting one means cotillion waits for as long as the components take. The
  timeout bounds the whole operation rather than each component. When it
  expires the in-flight component's AbortSignal fires, carrying the same error the operation
  rejects with, the components not yet reached are skipped with the reason `timeout`, and the
  operation rejects with a `TimeoutError`, cotillion's own exported class, whose message names
  the operation, the timeout and the component it was waiting for. A restart is a stop and then
  a start, each under its own timeout. The interrupted component is
  given the chance to wind down before the operation rejects, described under `abort()` (#10). A
  component cut away while starting is treated as started, so the next `stop()` attempts to
  stop it, and one cut away while stopping is still standing, so the next `stop()` tries it
  again. A `start()` or `stop()` which joins an operation already in flight joins it.

- `system.abort()` gives up on the operation in progress (#10). The in-flight component's
  AbortSignal fires, the components not yet reached are skipped with the reason `abort`, and once
  the in-flight invocation has wound down the pending `start()`, `stop()` or `restart()` rejects
  with an `AbortError`, cotillion's own exported class, whose message names the operation and the
  component it was waiting for. Aborting is graceful: cotillion never makes a component stop, it
  fires the signal and then waits for the invocation to settle, bounded by the component's
  `abort` timeout where one is declared. A component which settles in time is announced as
  `component_start_succeeded` or `component_start_failed` (or the stop equivalents) exactly as
  if nothing had happened, and the operation still rejects; only a component cotillion cuts
  away from without it settling is announced as `component_start_aborted` or
  `component_stop_aborted`, with the reason `abort` or `timeout` according to what interrupted
  the operation. A component with no abort timeout is waited on until it settles, or until
  `abort()` is called again, which cuts away at once. The same wind-down now applies when an
  overall timeout expires, so a timed-out component which finishes shortly afterwards gets its
  ordinary event rather than an aborted one, and the operation rejects with its `TimeoutError`
  once it has. A component cut away while starting is treated as started, so the next `stop()`
  attempts to stop it; one cut away while stopping is still standing, so the next `stop()` tries
  it again. Aborting when no operation is in progress does nothing, and never fires the signal of
  an operation which has already finished.

- The library's vocabulary now distinguishes a component from its definition (#15). A component
  is what a start function returns, the connected client or the listening server, and the
  `{ name, start, stop, timeout }` object which produces one is a component definition; the
  array of those is the system definition. So `createSystem(definition)` takes a
  `SystemDefinition` of `ComponentDefinition` entries, `start()` and `restart()` resolve to
  `Components` rather than `StartValues`, and the validation messages name `definition[1]`
  rather than `components[1]`. The ten component event names are unchanged, because they
  announce a component by name and the name belongs to both. Nothing has been published, so
  this breaks nobody.
