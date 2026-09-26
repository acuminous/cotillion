# Changelog

All notable changes to cotillion are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/).

## [0.1.1]

### Added

- `duration`, in milliseconds, on the events which end a component's or the system's start or
  stop, so a logger can say how long each took.

## [0.1.0] - 2026-09-26

The first release.

### Added

- `createSystem(definition, options)`: a system of named components with asynchronous start and
  stop functions, started in the declared order and stopped in reverse. Nested arrays start
  their entries in parallel, alternating with sequences at any depth.
- `start()` resolves to the components keyed by name, and passes each start function the
  components which started before it. In TypeScript the components are typed from the definition.
- A failed start stops the components which had started before `start()` rejects. A failed stop
  leaves the earlier components running, and a later `stop()` retries from where it left off.
- `stop()` during a start interrupts it: components declared `abortable` have their AbortSignal
  fired, the rest are waited for, and `start()` rejects with an `AbortError` once the stop has
  finished.
- System timeouts for starting and stopping, and per-component timeouts, each raising a
  `TimeoutError` naming the component concerned.
- `stopOn(...signals)` stops the system on process signals; `exitOn(...signals)` also exits the
  process with a code reflecting the outcome.
- Component and system events, typed, announcing every component and every operation, with the
  system's `name` on each system event.
- An example web app under `examples/web-app`: postgres, redis and a Hono server on Docker.

[Unreleased]: https://github.com/acuminous/cotillion/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/acuminous/cotillion/releases/tag/v0.1.0
