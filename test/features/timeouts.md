# Feature: Overall timeouts

An operation may be given a timeout in milliseconds, which bounds the whole operation rather
than each component. When it expires the in-flight component's abort signal fires, the
components not yet reached are skipped, and the operation rejects with a TimeoutError naming
the component it was waiting for. Without a timeout an operation waits for as long as its
components take.

Cotillion does not yet wait for an interrupted component to wind down: the timed-out component
is cut away the moment the timeout expires, and announced as aborted. The wind-down grace and
its abort timeout belong to aborting.

## Background:

- Given the system's events are recorded

## Rule: An operation with no timeout waits for as long as its components take

### Scenario: A start with no timeout

- Given the components postgres
- And each component starts on demand
- When the system starts
- Then the system has not started
- When postgres has started
- Then the system has started
- And postgres's start was given an abort signal which has not fired

### Scenario: A stop with no timeout

- Given the components postgres
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- Then the system has not stopped
- When postgres has stopped
- Then the system has stopped
- And postgres's stop was given an abort signal which has not fired

## Rule: The timeout bounds the whole operation

### Scenario: A start which exceeds its timeout

- Given the components postgres, emailListener, httpServer
- And each component starts
- And emailListener hangs while starting
- When the system starts with a timeout of 10ms
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for emailListener to start"
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
  | component_start_aborted   | emailListener | timeout | name, reason |
  | component_start_skipped   | httpServer    | timeout | name, reason |
  | system_start_failed       |               |         | error        |

### Scenario: A stop which exceeds its timeout

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener hangs while stopping
- When the system is started
- And the system stops with a timeout of 10ms
- Then the stop is rejected with a TimeoutError "The stop timed out after 10ms waiting for emailListener to stop"
- And the failed system stop event carries that error
- And emailListener's stop was given an abort signal which has fired with that error
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
  | component_stop_aborted    | emailListener | timeout | name, reason |
  | component_stop_skipped    | postgres      | timeout | name, reason |
  | system_stop_failed        |               |         | error        |

## Rule: A component cut away while starting is treated as started

### Scenario: Stopping after a start which timed out

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener hangs while starting
- When the system starts with a timeout of 10ms
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for emailListener to start"
- When the system is stopped
- Then the recorded invocations are:

  | lifecycle | component     |
  |-----------|---------------|
  | start     | postgres      |
  | start     | emailListener |
  | stop      | emailListener |
  | stop      | postgres      |

- And the recorded events are:

  | event                     | component     | reason  |
  |---------------------------|---------------|---------|
  | system_start_initiated    |               |         |
  | component_start_initiated | postgres      |         |
  | component_start_succeeded | postgres      |         |
  | component_start_initiated | emailListener |         |
  | component_start_aborted   | emailListener | timeout |
  | component_start_skipped   | httpServer    | timeout |
  | system_start_failed       |               |         |
  | system_stop_initiated     |               |         |
  | component_stop_skipped    | httpServer    | timeout |
  | component_stop_initiated  | emailListener |         |
  | component_stop_succeeded  | emailListener |         |
  | component_stop_initiated  | postgres      |         |
  | component_stop_succeeded  | postgres      |         |
  | system_stop_succeeded     |               |         |

## Rule: A component cut away while stopping is still standing

### Scenario: Stopping again after a stop which timed out

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- And httpServer stops on demand
- When the system is started
- And the system stops with a timeout of 10ms
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

## Rule: A restart's timeout spans the stop and the start

### Scenario: A restart which times out while stopping

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- And httpServer hangs while stopping
- When the system is started
- And the system restarts with a timeout of 10ms
- Then the restart is rejected with a TimeoutError "The restart timed out after 10ms waiting for httpServer to stop"
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
  | component_stop_aborted    | httpServer | timeout |
  | component_stop_skipped    | postgres   | timeout |
  | system_stop_failed        |            |         |

### Scenario: A restart which times out while starting

- Given the components postgres
- And each component starts on demand
- And each component stops
- When the system starts
- And postgres has started
- And the system restarts with a timeout of 10ms
- Then the restart is rejected with a TimeoutError "The restart timed out after 10ms waiting for postgres to start"
- And postgres's start was given an abort signal which has fired with that error
- And postgres's stop was given an abort signal which has fired with that error
- And the recorded events are:

  | event                     | component | reason  |
  |---------------------------|-----------|---------|
  | system_start_initiated    |           |         |
  | component_start_initiated | postgres  |         |
  | component_start_succeeded | postgres  |         |
  | system_start_succeeded    |           |         |
  | system_stop_initiated     |           |         |
  | component_stop_initiated  | postgres  |         |
  | component_stop_succeeded  | postgres  |         |
  | system_stop_succeeded     |           |         |
  | system_start_initiated    |           |         |
  | component_start_initiated | postgres  |         |
  | component_start_aborted   | postgres  | timeout |
  | system_start_failed       |           |         |
