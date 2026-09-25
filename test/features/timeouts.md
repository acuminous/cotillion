# Feature: Timeouts

A system may be given a start timeout and a stop timeout when it is created, each bounding the
whole operation rather than each component. Without one, an operation waits for as long as its
components take.

When the start timeout expires cotillion stops the system, exactly as it does when a component
fails to start: abortable components in flight are told to abort and the rest are waited for, the
components not yet reached are skipped, the components which started are stopped, and the start
rejects with a TimeoutError naming the component it was waiting for.

Cotillion never aborts a stop. When the stop timeout expires the component in flight is deemed
to have timed out, which is a failure: its failed event carries a TimeoutError, the components not
yet reached are skipped, and the stop rejects with the same error.

## Background:

- Given the system's events are recorded

## Rule: An operation with no timeout waits for as long as its components take

### Scenario: A start with no timeout

- Given the components postgres
- And each component starts on demand
- When the system starts
- Then the start is still in progress
- When postgres has started
- Then the system has started
- And postgres's start was given an abort signal which has not fired

### Scenario: A stop with no timeout

- Given the components postgres
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- Then the stop is still in progress
- When postgres has stopped
- Then the system has stopped

## Rule: A single timeout bounds both operations

### Scenario: A start which exceeds the system's timeout

- Given the components postgres
- And the system has a timeout of 10ms
- And each component starts
- And each component stops
- And postgres hangs while starting
- When the system starts
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for postgres to start"

### Scenario: A stop which exceeds the system's timeout

- Given the components postgres
- And the system has a timeout of 10ms
- And each component starts
- And each component stops
- And postgres hangs while stopping
- When the system is started
- And the system stops
- Then the stop is rejected with a TimeoutError "The stop timed out after 10ms waiting for postgres to stop"

## Rule: The start timeout stops the system

### Scenario: An abortable component which honours the abort

- Given the components postgres, emailListener, httpServer
- And the system has a start timeout of 10ms
- And each component starts
- And each component stops
- And emailListener starts on demand
- And emailListener is abortable
- When the system starts
- And the timeout has expired
- And emailListener has aborted
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for emailListener to start"
- And the start was rejected once the system had stopped
- And the failed system start event carries that error
- And emailListener's start was given an abort signal which has fired with that error
- And httpServer has not started
- And the recorded events are:

  | event                     | component     | reason  | payload      |
  |---------------------------|---------------|---------|--------------|
  | system_start_initiated    |               |         |              |
  | component_start_initiated | postgres      |         | name         |
  | component_start_succeeded | postgres      |         | name         |
  | component_start_initiated | emailListener |         | name         |
  | system_stop_initiated     |               |         |              |
  | component_start_aborted   | emailListener | timeout | name, reason |
  | component_start_skipped   | httpServer    | timeout | name, reason |
  | system_start_failed       |               |         | error        |
  | component_stop_skipped    | httpServer    | timeout | name, reason |
  | component_stop_skipped    | emailListener | abort   | name, reason |
  | component_stop_initiated  | postgres      |         | name         |
  | component_stop_succeeded  | postgres      |         | name         |
  | system_stop_succeeded     |               |         |              |

### Scenario: A component which cannot be aborted and finishes

- Given the components postgres, emailListener, httpServer
- And the system has a start timeout of 10ms
- And each component starts
- And each component stops
- And emailListener starts on demand
- When the system starts
- And the timeout has expired
- Then the start is still in progress
- And emailListener's start was given an abort signal which has not fired
- When emailListener has started
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for emailListener to start"
- And the recorded events are:

  | event                     | component     | reason  | payload      |
  |---------------------------|---------------|---------|--------------|
  | system_start_initiated    |               |         |              |
  | component_start_initiated | postgres      |         | name         |
  | component_start_succeeded | postgres      |         | name         |
  | component_start_initiated | emailListener |         | name         |
  | system_stop_initiated     |               |         |              |
  | component_start_succeeded | emailListener |         | name         |
  | component_start_skipped   | httpServer    | timeout | name, reason |
  | system_start_failed       |               |         | error        |
  | component_stop_skipped    | httpServer    | timeout | name, reason |
  | component_stop_initiated  | emailListener |         | name         |
  | component_stop_succeeded  | emailListener |         | name         |
  | component_stop_initiated  | postgres      |         | name         |
  | component_stop_succeeded  | postgres      |         | name         |
  | system_stop_succeeded     |               |         |              |

### Scenario: A component which cannot be aborted and does not finish before the stop timeout

- Given the components postgres, emailListener, httpServer
- And the system has a start timeout of 10ms
- And the system has a stop timeout of 10ms
- And each component starts
- And each component stops
- And emailListener hangs while starting
- When the system starts
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for emailListener to start"
- And emailListener's failed start event carries a TimeoutError "The stop timed out after 10ms waiting for emailListener to start"
- And the failed system stop event carries a TimeoutError "The stop timed out after 10ms waiting for emailListener to start"
- And postgres has not stopped
- And the recorded events are:

  | event                     | component     | reason  | payload      |
  |---------------------------|---------------|---------|--------------|
  | system_start_initiated    |               |         |              |
  | component_start_initiated | postgres      |         | name         |
  | component_start_succeeded | postgres      |         | name         |
  | component_start_initiated | emailListener |         | name         |
  | system_stop_initiated     |               |         |              |
  | component_start_failed    | emailListener |         | name, error  |
  | component_start_skipped   | httpServer    | timeout | name, reason |
  | system_start_failed       |               |         | error        |
  | component_stop_skipped    | httpServer    | timeout | name, reason |
  | component_stop_skipped    | emailListener | failure | name, reason |
  | component_stop_skipped    | postgres      | timeout | name, reason |
  | system_stop_failed        |               |         | error        |

## Rule: The stop timeout deems the component in flight to have timed out

### Scenario: A stop which exceeds its timeout

- Given the components postgres, emailListener, httpServer
- And the system has a stop timeout of 10ms
- And each component starts
- And each component stops
- And emailListener hangs while stopping
- When the system is started
- And the system stops
- Then the stop is rejected with a TimeoutError "The stop timed out after 10ms waiting for emailListener to stop"
- And the failed system stop event carries that error
- And emailListener's failed stop event carries that error
- And postgres has not stopped
- And the recorded events are:

  | event                     | component     | reason  | payload      |
  |---------------------------|---------------|---------|--------------|
  | system_start_initiated    |               |         |              |
  | component_start_initiated | postgres      |         | name         |
  | component_start_succeeded | postgres      |         | name         |
  | component_start_initiated | emailListener |         | name         |
  | component_start_succeeded | emailListener |         | name         |
  | component_start_initiated | httpServer    |         | name         |
  | component_start_succeeded | httpServer    |         | name         |
  | system_start_succeeded    |               |         |              |
  | system_stop_initiated     |               |         |              |
  | component_stop_initiated  | httpServer    |         | name         |
  | component_stop_succeeded  | httpServer    |         | name         |
  | component_stop_initiated  | emailListener |         | name         |
  | component_stop_failed     | emailListener |         | name, error  |
  | component_stop_skipped    | postgres      | timeout | name, reason |
  | system_stop_failed        |               |         | error        |

### Scenario: Stopping again after a stop which timed out

- Given the components postgres, httpServer
- And the system has a stop timeout of 10ms
- And each component starts
- And each component stops
- And httpServer stops on demand
- When the system is started
- And the system stops
- Then the stop is rejected with a TimeoutError "The stop timed out after 10ms waiting for httpServer to stop"
- When the system stops
- And httpServer has stopped
- Then the system has stopped
- And the recorded invocations are:

  | lifecycle | component  |
  |-----------|------------|
  | start     | postgres   |
  | start     | httpServer |
  | stop      | httpServer |
  | stop      | httpServer |
  | stop      | postgres   |

## Rule: A restart's stop and start are each bounded by their own timeout

### Scenario: A restart which times out while stopping

- Given the components postgres, httpServer
- And the system has a stop timeout of 10ms
- And each component starts
- And each component stops
- And httpServer hangs while stopping
- When the system is started
- And the system restarts
- Then the restart is rejected with a TimeoutError "The stop timed out after 10ms waiting for httpServer to stop"
- And postgres has started once
- And the recorded events are:

  | event                     | component  | reason  |
  |---------------------------|------------|---------|
  | system_start_initiated    |            |         |
  | component_start_initiated | postgres   |         |
  | component_start_succeeded | postgres   |         |
  | component_start_initiated | httpServer |         |
  | component_start_succeeded | httpServer |         |
  | system_start_succeeded    |            |         |
  | system_stop_initiated     |            |         |
  | component_stop_initiated  | httpServer |         |
  | component_stop_failed     | httpServer |         |
  | component_stop_skipped    | postgres   | timeout |
  | system_stop_failed        |            |         |

### Scenario: A restart which times out while starting

- Given the components postgres
- And the system has a start timeout of 10ms
- And each component starts on demand
- And each component stops
- When the system starts
- And postgres has started
- And the system restarts
- And the timeout has expired
- And postgres has started
- Then the restart is rejected with a TimeoutError "The start timed out after 10ms waiting for postgres to start"
- And the recorded events are:

  | event                     | component | reason |
  |---------------------------|-----------|--------|
  | system_start_initiated    |           |        |
  | component_start_initiated | postgres  |        |
  | component_start_succeeded | postgres  |        |
  | system_start_succeeded    |           |        |
  | system_stop_initiated     |           |        |
  | component_stop_initiated  | postgres  |        |
  | component_stop_succeeded  | postgres  |        |
  | system_stop_succeeded     |           |        |
  | system_start_initiated    |           |        |
  | component_start_initiated | postgres  |        |
  | system_stop_initiated     |           |        |
  | component_start_succeeded | postgres  |        |
  | system_start_failed       |           |        |
  | component_stop_initiated  | postgres  |        |
  | component_stop_succeeded  | postgres  |        |
  | system_stop_succeeded     |           |        |
