# Feature: Stopping during a start

Calling stop() while the system is starting interrupts the start. A component which declared
itself abortable has its signal fired and is waited for: if it rejects it honoured the abort and
is announced as aborted; if it resolves regardless it is up, is announced as succeeded, and is
stopped like any other. A component which did not declare itself abortable is never interrupted:
cotillion waits for its start to finish or fail. The components not yet reached are skipped, and
the stop then proceeds through whatever started.

An interrupted start is not a failure, so it announces no outcome of its own. The events tell it
in the order it happened: the stop announces itself as soon as it is called, the component events
follow as the start winds down, then the stops run, then the stop announces its outcome. The start
resolves once the stop has finished, whatever its outcome, to an empty object.

## Background:

- Given the system's events are recorded

## Rule: Stopping interrupts the start

### Scenario: An abortable component which honours the abort

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And each component stops on demand
- And emailListener is abortable
- When the system starts
- And postgres has started
- And the system stops
- Then the start is still in progress
- When emailListener has aborted
- Then the start is still in progress
- And the stop is still in progress
- And emailListener's start was given an abort signal which has fired with an AbortError "The start was aborted while waiting for emailListener to start"
- And httpServer has not started
- When postgres has stopped
- Then the system has stopped
- And the start resolved to no components
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | system_stop_initiated     |               |        |              |
  | component_start_aborted   | emailListener | abort  | name, reason |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | component_stop_skipped    | httpServer    | abort  | name, reason |
  | component_stop_skipped    | emailListener | abort  | name, reason |
  | component_stop_initiated  | postgres      |        | name         |
  | component_stop_succeeded  | postgres      |        | name         |
  | system_stop_succeeded     |               |        |              |

### Scenario: An abortable component which rejects with its own error

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And each component stops
- And emailListener is abortable
- When the system starts
- And postgres has started
- And the system stops
- And emailListener has failed to start
- Then the system has stopped
- And the start resolved to no components
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | system_stop_initiated     |               |        |              |
  | component_start_aborted   | emailListener | abort  | name, reason |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | component_stop_skipped    | httpServer    | abort  | name, reason |
  | component_stop_skipped    | emailListener | abort  | name, reason |
  | component_stop_initiated  | postgres      |        | name         |
  | component_stop_succeeded  | postgres      |        | name         |
  | system_stop_succeeded     |               |        |              |

### Scenario: An abortable component which completes regardless

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And each component stops
- And emailListener is abortable
- When the system starts
- And postgres has started
- And the system stops
- And emailListener has started
- Then the system has stopped
- And the start resolved to no components
- And emailListener's start was given an abort signal which has fired with an AbortError "The start was aborted while waiting for emailListener to start"
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | system_stop_initiated     |               |        |              |
  | component_start_succeeded | emailListener |        | name         |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | component_stop_skipped    | httpServer    | abort  | name, reason |
  | component_stop_initiated  | emailListener |        | name         |
  | component_stop_succeeded  | emailListener |        | name         |
  | component_stop_initiated  | postgres      |        | name         |
  | component_stop_succeeded  | postgres      |        | name         |
  | system_stop_succeeded     |               |        |              |

### Scenario: A component which cannot be aborted

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And each component stops
- When the system starts
- And postgres has started
- And the system stops
- Then the start is still in progress
- And emailListener's start was given an abort signal which has not fired
- When emailListener has started
- Then the system has stopped
- And the start resolved to no components
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | system_stop_initiated     |               |        |              |
  | component_start_succeeded | emailListener |        | name         |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | component_stop_skipped    | httpServer    | abort  | name, reason |
  | component_stop_initiated  | emailListener |        | name         |
  | component_stop_succeeded  | emailListener |        | name         |
  | component_stop_initiated  | postgres      |        | name         |
  | component_stop_succeeded  | postgres      |        | name         |
  | system_stop_succeeded     |               |        |              |

### Scenario: Stopping between two components

- Given the components postgres, emailListener
- And each component starts
- And each component stops
- And the system is stopped as soon as postgres has started
- When the system starts
- Then the start resolved to no components
- And emailListener has not started
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | system_stop_initiated     |               |        |              |
  | component_start_skipped   | emailListener | abort  | name, reason |
  | component_stop_skipped    | emailListener | abort  | name, reason |
  | component_stop_initiated  | postgres      |        | name         |
  | component_stop_succeeded  | postgres      |        | name         |
  | system_stop_succeeded     |               |        |              |

### Scenario: Stopping as soon as a component's start is initiated

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And each component stops
- And emailListener is abortable
- And the system is stopped as soon as emailListener's start is initiated
- When the system starts
- And postgres has started
- And emailListener has aborted
- Then the start resolved to no components
- And emailListener's start was given an abort signal which has fired with an AbortError "The start was aborted while waiting for emailListener to start"
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | system_stop_initiated     |               |        |              |
  | component_start_aborted   | emailListener | abort  | name, reason |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | component_stop_skipped    | httpServer    | abort  | name, reason |
  | component_stop_skipped    | emailListener | abort  | name, reason |
  | component_stop_initiated  | postgres      |        | name         |
  | component_stop_succeeded  | postgres      |        | name         |
  | system_stop_succeeded     |               |        |              |

## Rule: The stop timeout bounds the wait for the interrupted start

### Scenario: A component which does not finish before the stop timeout

- Given the components postgres, emailListener, httpServer
- And the system has a stop timeout of 10ms
- And each component starts on demand
- And each component stops
- And emailListener hangs while starting
- When the system starts
- And postgres has started
- And the system stops
- Then the stop is rejected with a TimeoutError "The stop timed out after 10ms waiting for emailListener to start"
- And the start resolved to no components
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
  | component_start_skipped   | httpServer    | abort   | name, reason |
  | component_stop_skipped    | httpServer    | abort   | name, reason |
  | component_stop_skipped    | emailListener | failure | name, reason |
  | component_stop_skipped    | postgres      | timeout | name, reason |
  | system_stop_failed        |               |         | error        |
