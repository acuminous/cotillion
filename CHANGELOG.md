# Changelog

All notable changes to cotillion are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `createSystem` exists, returning a system you can start and stop (#1). A system with no
  components starts, resolving to an object of start values with no entries, and stops. The
  system is an EventEmitter and announces `system_start_initiated`, `system_start_succeeded`,
  `system_stop_initiated` and `system_stop_succeeded` around those operations, so a caller can
  already see an operation begin and end. The ordering, timeout and abort semantics the README
  specifies are not implemented yet, so there is nothing here worth depending on.

- `createSystem` validates the component tree and throws rather than returning a system which
  would fail later (#2). It checks that every entry is an object with a string name, that
  names are unique throughout the tree including inside nested groups at any depth, that start
  and stop are functions where present, and that timeouts are positive numbers under the three
  known keys. The message names the offending component, or its position when it has no usable
  name, and the first violation in declaration order is the one reported. In TypeScript the
  same rules are enforced at compile time: an unknown timeout key or a start which is not a
  function will not typecheck.

- `system.start()` runs each component's start function in declaration order, one at a time, and
  resolves to an object of start values keyed by component name (#3). A component with no start
  function, or whose start returns nothing, appears with the value `undefined`, so every component
  is in the object, and the values are returned to the caller rather than passed to other
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
  the reason its start did not succeed where one ran, and `unstarted`, a new reason, where the
  system never started at all. A shutdown trace therefore names every component whether the
  system was fully started, partly started or never started, which is what an exit handler
  wants to log. Cotillion still never calls a stop function for a component which did not
  start, because a stop function is written against what its start created. Every listener receives one payload object, `{ name }` plus `error` or
  `reason` where the table says so. The events are notifications: a system with no listeners
  starts, stops and rejects exactly as before. The `timeout` and `abort` reasons, and the
  `component_start_aborted` and `component_stop_aborted` events, are documented but not yet
  emitted, and the failed system events still wait on #7.
