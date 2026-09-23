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

- Every event name the README documents is exported as a constant, `ComponentEvent` and
  `SystemEvent`, mirroring the two tables in the Events section (#1). Listeners can be
  registered with either a constant or the string literal, and both are typed. Only the four
  system events above are emitted so far.
