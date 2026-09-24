# Feature: Process events

system.stopOn(...events) stops the system when the process emits any of the named events, so an
application need not wire its own shutdown handlers. The events are explicit: cotillion presumes
nothing about which process events mean shutdown. The first to arrive stops the system; further
events while that stop is in progress change nothing, because they join it. A stop begun this way
has no caller to receive its outcome, so it announces the outcome only through the system events,
which is where an exit listener finds it. Cotillion never calls process.exit.

The scenarios emit harmless custom event names on the real process, never termination signals.

## Background:

- Given the system's events are recorded

## Rule: A process event stops the system

### Scenario: An event received while the system is running

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- And the system stops on the process events shutdown, terminate
- When the system is started
- And the process emits terminate
- Then httpServer has stopped once
- And postgres has stopped once
- And the recorded events are:

  | event                     | component  |
  |---------------------------|------------|
  | system_start_initiated    |            |
  | component_start_initiated | postgres   |
  | component_start_succeeded | postgres   |
  | component_start_initiated | httpServer |
  | component_start_succeeded | httpServer |
  | system_start_succeeded    |            |
  | system_stop_initiated     |            |
  | component_stop_initiated  | httpServer |
  | component_stop_succeeded  | httpServer |
  | component_stop_initiated  | postgres   |
  | component_stop_succeeded  | postgres   |
  | system_stop_succeeded     |            |

### Scenario: An event received before the system has started

- Given the components postgres
- And each component starts
- And each component stops
- And the system stops on the process events shutdown
- When the process emits shutdown
- Then postgres has not started
- And the recorded events are:

  | event                  | component | reason  |
  |------------------------|-----------|---------|
  | system_stop_initiated  |           |         |
  | component_stop_skipped | postgres  | stopped |
  | system_stop_succeeded  |           |         |

### Scenario: An event received while the system is starting

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- And each component stops
- And emailListener is abortable
- And the system stops on the process events shutdown
- When the system starts
- And postgres has started
- And the process emits shutdown
- And emailListener has aborted
- Then the start is rejected with an AbortError "The start was aborted while waiting for emailListener to start"
- And httpServer has not started
- And the recorded events are:

  | event                     | component     | reason |
  |---------------------------|---------------|--------|
  | system_start_initiated    |               |        |
  | component_start_initiated | postgres      |        |
  | component_start_succeeded | postgres      |        |
  | component_start_initiated | emailListener |        |
  | system_stop_initiated     |               |        |
  | component_start_aborted   | emailListener | abort  |
  | component_start_skipped   | httpServer    | abort  |
  | component_stop_skipped    | httpServer    | abort  |
  | component_stop_skipped    | emailListener | abort  |
  | component_stop_initiated  | postgres      |        |
  | component_stop_succeeded  | postgres      |        |
  | system_stop_succeeded     |               |        |

## Rule: Further events change nothing while the stop is in progress

### Scenario: The same event twice, another event, and a second binding

- Given the components postgres
- And each component starts
- And each component stops on demand
- And the system stops on the process events shutdown, terminate
- And the system stops on the process events shutdown
- When the system is started
- And the process emits shutdown
- And the process emits shutdown
- And the process emits terminate
- Then postgres is stopping
- When postgres has stopped
- Then postgres has stopped once
- And the recorded events are:

  | event                     |
  |---------------------------|
  | system_start_initiated    |
  | component_start_initiated |
  | component_start_succeeded |
  | system_start_succeeded    |
  | system_stop_initiated     |
  | component_stop_initiated  |
  | component_stop_succeeded  |
  | system_stop_succeeded     |

### Scenario: An event received after the system has stopped

- Given the components postgres
- And each component starts
- And each component stops
- And the system stops on the process events shutdown
- When the system is started
- And the process emits shutdown
- And the process emits shutdown
- Then postgres has stopped once
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
  | system_stop_initiated     |           |         |
  | component_stop_skipped    | postgres  | stopped |
  | system_stop_succeeded     |           |         |

### Scenario: An event received after a restart

- Given the components postgres
- And each component starts
- And each component stops
- And the system stops on the process events shutdown
- When the system is started
- And the system is restarted
- And the process emits shutdown
- Then postgres has started twice
- And postgres has stopped twice

## Rule: The stop begun by a process event announces its outcome only through the events

### Scenario: A stop which fails

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- And httpServer fails to stop
- And the system stops on the process events shutdown
- When the system is started
- And the process emits shutdown
- Then the failed system stop event carries httpServer's error
- And postgres has not stopped

## Rule: The listeners can be unbound

### Scenario: An event received after unbinding

- Given the components postgres
- And each component starts
- And each component stops
- And the system stops on the process events shutdown, terminate
- When the system is started
- And the process events are unbound
- And the process emits shutdown
- Then postgres has not stopped
- And the process has no listeners for shutdown
- And the process has no listeners for terminate
- And the recorded events are:

  | event                     |
  |---------------------------|
  | system_start_initiated    |
  | component_start_initiated |
  | component_start_succeeded |
  | system_start_succeeded    |

## Rule: The events are explicit

### Scenario: No events

- Given the components postgres
- When the system is asked to stop on no process events
- Then the request is rejected with "The system must be given at least one process event to stop on"

### Scenario: An event which is not a string

- Given the components postgres
- When the system is asked to stop on the process event 15
- Then the request is rejected with "The system has a process event which is not a string"
