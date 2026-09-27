# Feature: Component failures

A component can fail after it has started: a database client emits an error, a subscription
drops. Its start function is given a fail function for exactly this, and calls it with the
error. What cotillion does with the report depends on when it arrives. Once the system has
started, it announces component_failed and nothing more: the application decides whether to
restart, stop or carry on. While the system is still starting, the report fails the start, so
start() never resolves to a system with a component already known to be broken. While the
component's own start is still in flight, the report fails that start, exactly as its own
timeout would.

## Background:

- Given the system's events are recorded

## Rule: A failure after the system has started is announced, and nothing more

### Scenario: A component reports a failure

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- When the system is started
- And postgres reports a failure
- Then postgres's failed event carries the reported error
- And postgres has not stopped
- And the recorded events are:

  | event                     | component  | payload     |
  |---------------------------|------------|-------------|
  | system_start_initiated    |            | name        |
  | component_start_initiated | postgres   | name        |
  | component_start_succeeded | postgres   | name, duration |
  | component_start_initiated | httpServer | name        |
  | component_start_succeeded | httpServer | name, duration |
  | system_start_succeeded    |            | name, duration |
  | component_failed          | postgres   | name, error |

### Scenario: A component reports a failure twice

- Given the components postgres
- And each component starts
- And each component stops
- When the system is started
- And postgres reports a failure
- And postgres reports a failure
- Then the recorded events are:

  | event                     | component |
  |---------------------------|-----------|
  | system_start_initiated    |           |
  | component_start_initiated | postgres  |
  | component_start_succeeded | postgres  |
  | system_start_succeeded    |           |
  | component_failed          | postgres  |
  | component_failed          | postgres  |

### Scenario: The application restarts the system

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- And the system restarts when postgres fails
- When the system is started
- And postgres reports a failure
- Then postgres has started twice
- And httpServer has started twice
- And the recorded events are:

  | event                     | component  |
  |---------------------------|------------|
  | system_start_initiated    |            |
  | component_start_initiated | postgres   |
  | component_start_succeeded | postgres   |
  | component_start_initiated | httpServer |
  | component_start_succeeded | httpServer |
  | system_start_succeeded    |            |
  | component_failed          | postgres   |
  | system_stop_initiated     |            |
  | component_stop_initiated  | httpServer |
  | component_stop_succeeded  | httpServer |
  | component_stop_initiated  | postgres   |
  | component_stop_succeeded  | postgres   |
  | system_stop_succeeded     |            |
  | system_start_initiated    |            |
  | component_start_initiated | postgres   |
  | component_start_succeeded | postgres   |
  | component_start_initiated | httpServer |
  | component_start_succeeded | httpServer |
  | system_start_succeeded    |            |

### Scenario: A failure reported after the component has stopped is ignored

- Given the components postgres
- And each component starts
- And each component stops
- When the system is started
- And the system is stopped
- And postgres reports a failure
- Then the recorded events are:

  | event                     | component |
  |---------------------------|-----------|
  | system_start_initiated    |           |
  | component_start_initiated | postgres  |
  | component_start_succeeded | postgres  |
  | system_start_succeeded    |           |
  | system_stop_initiated     |           |
  | component_stop_initiated  | postgres  |
  | component_stop_succeeded  | postgres  |
  | system_stop_succeeded     |           |

## Rule: A failure while the system is still starting fails the start

### Scenario: A started component fails while a later one is starting

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And each component stops
- When the system starts
- And postgres has started
- And postgres reports a failure
- Then the start is still in progress
- When emailListener has started
- Then the recorded events are:

  | event                     | component     | reason  |
  |---------------------------|---------------|---------|
  | system_start_initiated    |               |         |
  | component_start_initiated | postgres      |         |
  | component_start_succeeded | postgres      |         |
  | component_start_initiated | emailListener |         |
  | component_failed          | postgres      |         |
  | component_start_succeeded | emailListener |         |
  | component_start_skipped   | httpServer    | failure |
  | system_start_failed       |               |         |
  | system_stop_initiated     |               |         |
  | component_stop_skipped    | httpServer    | failure |
  | component_stop_initiated  | emailListener |         |
  | component_stop_succeeded  | emailListener |         |
  | component_stop_initiated  | postgres      |         |
  | component_stop_succeeded  | postgres      |         |
  | system_stop_succeeded     |               |         |

- And the start is rejected with postgres's reported error
- And the failed system start event carries that error
- And httpServer has not started
- And postgres has stopped once

## Rule: A failure while the component's own start is in flight fails that start

### Scenario: A component reports a failure before its start has resolved

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- And postgres starts on demand
- When the system starts
- And postgres reports a failure
- Then the recorded events are:

  | event                     | component  | reason  |
  |---------------------------|------------|---------|
  | system_start_initiated    |            |         |
  | component_start_initiated | postgres   |         |
  | component_start_failed    | postgres   |         |
  | component_start_skipped   | httpServer | failure |
  | system_start_failed       |            |         |
  | system_stop_initiated     |            |         |
  | component_stop_skipped    | httpServer | failure |
  | component_stop_skipped    | postgres   | failure |
  | system_stop_succeeded     |            |         |

- And the start is rejected with postgres's reported error
- And postgres's failed start event carries that error
- And httpServer has not started
