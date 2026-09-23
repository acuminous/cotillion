# Feature: Aborting

system.abort() gives up on the operation in progress. The in-flight component's abort signal
fires, the components not yet reached are skipped, and once the in-flight invocation has wound
down the operation rejects with an AbortError naming the component it was waiting for.

Aborting is graceful. Cotillion never makes a component stop: it fires the signal, then waits
for the invocation to settle, bounded by the component's abort timeout where one is declared.
A component which winds down in time is announced as succeeded or failed like any other; only
a component cotillion cuts away from without it settling is announced as aborted. A component
with no abort timeout is waited on until it settles, or until abort() is called again, which
cuts away at once.

## Background:

- Given the system's events are recorded

## Rule: Aborting gives up on the operation in progress

### Scenario: Aborting a start

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- When the system starts
- And postgres has started
- And the system is aborted
- Then the start is still in progress
- When emailListener has started
- Then the start is rejected with an AbortError "The start was aborted while waiting for emailListener to start"
- And the failed system start event carries that error
- And emailListener's start was given an abort signal which has fired with that error
- And httpServer has not started
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | component_start_succeeded | emailListener |        | name         |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | system_start_failed       |               |        | error        |

### Scenario: Aborting a stop

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- And httpServer has stopped
- And the system is aborted
- Then the stop is still in progress
- When emailListener has stopped
- Then the stop is rejected with an AbortError "The stop was aborted while waiting for emailListener to stop"
- And the failed system stop event carries that error
- And emailListener's stop was given an abort signal which has fired with that error
- And postgres has not stopped
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | component_start_succeeded | emailListener |        | name         |
  | component_start_initiated | httpServer    |        | name         |
  | component_start_succeeded | httpServer    |        | name         |
  | system_start_succeeded    |               |        |              |
  | system_stop_initiated     |               |        |              |
  | component_stop_initiated  | httpServer    |        | name         |
  | component_stop_succeeded  | httpServer    |        | name         |
  | component_stop_initiated  | emailListener |        | name         |
  | component_stop_succeeded  | emailListener |        | name         |
  | component_stop_skipped    | postgres      | abort  | name, reason |
  | system_stop_failed        |               |        | error        |

### Scenario: Aborting between two components

- Given the components postgres, emailListener
- And each component starts
- And the system is aborted as soon as postgres has started
- When the system starts
- Then the start is rejected with an AbortError "The start was aborted"
- And emailListener has not started
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_skipped   | emailListener | abort  | name, reason |
  | system_start_failed       |               |        | error        |

### Scenario: Aborting as soon as a component's start is initiated

- Given the components postgres, emailListener, httpServer
- And each component starts
- And emailListener hangs while starting
- And emailListener has an abort timeout of 10ms
- And the system is aborted as soon as emailListener's start is initiated
- When the system starts
- Then the start is rejected with an AbortError "The start was aborted while waiting for emailListener to start"
- And emailListener's start was given an abort signal which has fired with that error
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | component_start_aborted   | emailListener | abort  | name, reason |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | system_start_failed       |               |        | error        |

### Scenario: Aborting when nothing is in progress

- Given the components postgres
- And each component starts
- And each component stops
- When the system is started
- And the system is aborted
- And the system is stopped
- Then postgres's start was given an abort signal which has not fired
- And the recorded events are:

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

### Scenario: Aborting as soon as the start has succeeded

- Given the components postgres
- And each component starts
- And each component stops
- And the system is aborted as soon as the start has succeeded
- When the system is started
- And the system is stopped
- Then postgres's start was given an abort signal which has not fired
- And the recorded events are:

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

## Rule: An aborted component is given the chance to wind down

### Scenario: A component which fails while winding down

- Given the components postgres, emailListener
- And each component starts
- And each component stops
- And emailListener stops on demand
- When the system is started
- And the system stops
- And the system is aborted
- And emailListener has failed to stop
- Then the stop is rejected with an AbortError "The stop was aborted while waiting for emailListener to stop"
- And the failed system stop event carries that error
- And the failed component stop event carries emailListener's error
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | component_start_succeeded | emailListener |        | name         |
  | system_start_succeeded    |               |        |              |
  | system_stop_initiated     |               |        |              |
  | component_stop_initiated  | emailListener |        | name         |
  | component_stop_failed     | emailListener |        | name, error  |
  | component_stop_skipped    | postgres      | abort  | name, reason |
  | system_stop_failed        |               |        | error        |

### Scenario: A component which does not wind down within its abort timeout

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And emailListener hangs while starting
- And emailListener has an abort timeout of 10ms
- When the system starts
- And postgres has started
- And the system is aborted
- Then the start is rejected with an AbortError "The start was aborted while waiting for emailListener to start"
- And emailListener's start was given an abort signal which has fired with that error
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | component_start_aborted   | emailListener | abort  | name, reason |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | system_start_failed       |               |        | error        |

### Scenario: Aborting again cuts away at once

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And emailListener hangs while starting
- When the system starts
- And postgres has started
- And the system is aborted
- Then the start is still in progress
- When the system is aborted again
- Then the start is rejected with an AbortError "The start was aborted while waiting for emailListener to start"
- And the recorded events are:

  | event                     | component     | reason | payload      |
  |---------------------------|---------------|--------|--------------|
  | system_start_initiated    |               |        |              |
  | component_start_initiated | postgres      |        | name         |
  | component_start_succeeded | postgres      |        | name         |
  | component_start_initiated | emailListener |        | name         |
  | component_start_aborted   | emailListener | abort  | name, reason |
  | component_start_skipped   | httpServer    | abort  | name, reason |
  | system_start_failed       |               |        | error        |

## Rule: A component cut away while starting is treated as started

### Scenario: Stopping after an aborted start

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And each component stops
- And emailListener hangs while starting
- And emailListener has an abort timeout of 10ms
- When the system starts
- And postgres has started
- And the system is aborted
- Then the start is rejected with an AbortError "The start was aborted while waiting for emailListener to start"
- When the system is stopped
- Then the recorded invocations are:

  | lifecycle | component     |
  |-----------|---------------|
  | start     | postgres      |
  | start     | emailListener |
  | stop      | emailListener |
  | stop      | postgres      |

- And the recorded events are:

  | event                     | component     | reason |
  |---------------------------|---------------|--------|
  | system_start_initiated    |               |        |
  | component_start_initiated | postgres      |        |
  | component_start_succeeded | postgres      |        |
  | component_start_initiated | emailListener |        |
  | component_start_aborted   | emailListener | abort  |
  | component_start_skipped   | httpServer    | abort  |
  | system_start_failed       |               |        |
  | system_stop_initiated     |               |        |
  | component_stop_skipped    | httpServer    | abort  |
  | component_stop_initiated  | emailListener |        |
  | component_stop_succeeded  | emailListener |        |
  | component_stop_initiated  | postgres      |        |
  | component_stop_succeeded  | postgres      |        |
  | system_stop_succeeded     |               |        |

## Rule: A component cut away while stopping is still standing

### Scenario: Stopping again after an aborted stop

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- And httpServer stops on demand
- And httpServer has an abort timeout of 10ms
- When the system is started
- And the system stops
- And the system is aborted
- Then the stop is rejected with an AbortError "The stop was aborted while waiting for httpServer to stop"
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
