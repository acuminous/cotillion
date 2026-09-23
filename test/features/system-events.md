# Feature: System events

A system announces each operation as a whole, either side of the component events that
operation caused. These are the events a caller exits on, since cotillion never calls
process.exit itself: a listener on system_stop_succeeded sees every stop which succeeded,
however that stop was triggered, and whether or not it had anything to stop.

The initiated and succeeded events carry no payload. The failed events carry the operation's
error, which is the same object the promise rejects with.

## Background:

- Given the system's events are recorded

## Rule: Each operation is bracketed by its own events

### Scenario: A system which starts and stops cleanly

- Given the components postgres
- And each component starts
- And each component stops
- When the system is started
- And the system is stopped
- Then the recorded events are:

  | event                     | component | payload |
  |---------------------------|-----------|---------|
  | system_start_initiated    |           |         |
  | component_start_initiated | postgres  | name    |
  | component_start_succeeded | postgres  | name    |
  | system_start_succeeded    |           |         |
  | system_stop_initiated     |           |         |
  | component_stop_initiated  | postgres  | name    |
  | component_stop_succeeded  | postgres  | name    |
  | system_stop_succeeded     |           |         |

### Scenario: A start which fails

- Given the components postgres, emailListener, httpServer
- And each component starts
- And emailListener fails to start
- When the system starts
- Then the start is rejected with emailListener's error
- And the failed system start event carries emailListener's error
- And the recorded events are:

  | event                     | component     | reason  | payload      |
  |---------------------------|---------------|---------|--------------|
  | system_start_initiated    |               |         |              |
  | component_start_initiated | postgres      |         | name         |
  | component_start_succeeded | postgres      |         | name         |
  | component_start_initiated | emailListener |         | name         |
  | component_start_failed    | emailListener |         | name, error  |
  | component_start_skipped   | httpServer    | failure | name, reason |
  | system_start_failed       |               |         | error        |

### Scenario: A stop which fails

- Given the components postgres, emailListener
- And each component starts
- And each component stops
- And emailListener fails to stop
- When the system is started
- And the system stops
- Then the stop is rejected with emailListener's error
- And the failed system stop event carries emailListener's error
- And the recorded events are:

  | event                     | component     | reason  | payload      |
  |---------------------------|---------------|---------|--------------|
  | system_start_initiated    |               |         |              |
  | component_start_initiated | postgres      |         | name         |
  | component_start_succeeded | postgres      |         | name         |
  | component_start_initiated | emailListener |         | name         |
  | component_start_succeeded | emailListener |         | name         |
  | system_start_succeeded    |               |         |              |
  | system_stop_initiated     |               |         |              |
  | component_stop_initiated  | emailListener |         | name         |
  | component_stop_failed     | emailListener |         | name, error  |
  | component_stop_skipped    | postgres      | failure | name, reason |
  | system_stop_failed        |               |         | error        |

## Rule: The events belong to the operation, not to the call

### Scenario: A start which joins one already in flight

- Given the components postgres
- And each component starts on demand
- When the system starts
- And the system starts
- And postgres has started
- Then the recorded events are:

  | event                     | component |
  |---------------------------|-----------|
  | system_start_initiated    |           |
  | component_start_initiated | postgres  |
  | component_start_succeeded | postgres  |
  | system_start_succeeded    |           |

### Scenario: A stop which joins one already in flight

- Given the components postgres
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- And the system stops
- And postgres has stopped
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

### Scenario: A stop retried after one which failed

- Given the components postgres, emailListener
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- And emailListener has failed to stop
- Then the stop is rejected with emailListener's error
- When the system stops
- And emailListener has stopped
- And postgres has stopped
- Then the system has stopped
- And the recorded events are:

  | event                     | component     | reason  |
  |---------------------------|---------------|---------|
  | system_start_initiated    |               |         |
  | component_start_initiated | postgres      |         |
  | component_start_succeeded | postgres      |         |
  | component_start_initiated | emailListener |         |
  | component_start_succeeded | emailListener |         |
  | system_start_succeeded    |               |         |
  | system_stop_initiated     |               |         |
  | component_stop_initiated  | emailListener |         |
  | component_stop_failed     | emailListener |         |
  | component_stop_skipped    | postgres      | failure |
  | system_stop_failed        |               |         |
  | system_stop_initiated     |               |         |
  | component_stop_initiated  | emailListener |         |
  | component_stop_succeeded  | emailListener |         |
  | component_stop_initiated  | postgres      |         |
  | component_stop_succeeded  | postgres      |         |
  | system_stop_succeeded     |               |         |

## Rule: An operation with nothing to do is announced like any other

### Scenario: Stopping a system which was never started

- Given the components postgres
- And each component starts
- And each component stops
- When the system is stopped
- Then the recorded events are:

  | event                  | component | reason    | payload      |
  |------------------------|-----------|-----------|--------------|
  | system_stop_initiated  |           |           |              |
  | component_stop_skipped | postgres  | stopped   | name, reason |
  | system_stop_succeeded  |           |           |              |

### Scenario: Starting a system which has already started

- Given the components postgres, httpServer
- And each component starts
- When the system is started
- And the system is started
- Then both starts resolve to the same components
- And the recorded events are:

  | event                     | component  | reason  | payload      |
  |---------------------------|------------|---------|--------------|
  | system_start_initiated    |            |         |              |
  | component_start_initiated | postgres   |         | name         |
  | component_start_succeeded | postgres   |         | name         |
  | component_start_initiated | httpServer |         | name         |
  | component_start_succeeded | httpServer |         | name         |
  | system_start_succeeded    |            |         |              |
  | system_start_initiated    |            |         |              |
  | component_start_skipped   | postgres   | started | name, reason |
  | component_start_skipped   | httpServer | started | name, reason |
  | system_start_succeeded    |            |         |              |

## Rule: A restart announces the stop pair, then the start pair

### Scenario: Restarting a started system

- Given the components postgres
- And each component starts
- And each component stops
- When the system is started
- And the system is restarted
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
  | system_start_initiated    |           |
  | component_start_initiated | postgres  |
  | component_start_succeeded | postgres  |
  | system_start_succeeded    |           |

### Scenario: Restarting a system which was never started

- Given the components postgres
- And each component starts
- And each component stops
- When the system is restarted
- Then the recorded events are:

  | event                     | component | reason    |
  |---------------------------|-----------|-----------|
  | system_stop_initiated     |           |           |
  | component_stop_skipped    | postgres  | stopped   |
  | system_stop_succeeded     |           |           |
  | system_start_initiated    |           |           |
  | component_start_initiated | postgres  |           |
  | component_start_succeeded | postgres  |           |
  | system_start_succeeded    |           |           |
