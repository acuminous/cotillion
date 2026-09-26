# Feature: Component timeouts

A component may declare its own timeout, bounding each invocation of its start and its stop: a
number bounds both, an object bounds them separately, and there are no defaults. A component
exceeding its own timeout has failed, exactly as if it had rejected: its failed event carries a
TimeoutError naming it, the components not yet reached are skipped as after any failure, and the
operation fails fast. The invocation itself runs on unobserved. An abortable component's start has
its signal fired as well; a stop is never interrupted.

The system's timeouts still apply, and whichever bound is sooner wins. The two are told apart by
their errors: a component's names the component, the system's names the operation.

## Background:

- Given the system's events are recorded

## Rule: A component exceeding its own timeout has failed

### Scenario: A start which exceeds the component's timeout

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener hangs while starting
- And emailListener has a start timeout of 10ms
- When the system starts
- Then the start is rejected with a TimeoutError "The component emailListener timed out after 10ms while starting"
- And the start was rejected once the system had stopped
- And emailListener's failed start event carries that error
- And the failed system start event carries that error
- And httpServer has not started
- And the recorded events are:

  | event                     | component     | reason  | payload               |
  |---------------------------|---------------|---------|-----------------------|
  | system_start_initiated    |               |         | name                  |
  | component_start_initiated | postgres      |         | name                  |
  | component_start_succeeded | postgres      |         | name, duration        |
  | component_start_initiated | emailListener |         | name                  |
  | component_start_failed    | emailListener |         | name, error, duration |
  | component_start_skipped   | httpServer    | failure | name, reason          |
  | system_start_failed       |               |         | name, error, duration |
  | system_stop_initiated     |               |         | name                  |
  | component_stop_skipped    | httpServer    | failure | name, reason          |
  | component_stop_skipped    | emailListener | failure | name, reason          |
  | component_stop_initiated  | postgres      |         | name                  |
  | component_stop_succeeded  | postgres      |         | name, duration        |
  | system_stop_succeeded     |               |         | name, duration        |

### Scenario: A stop which exceeds the component's timeout

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener hangs while stopping
- And emailListener has a stop timeout of 10ms
- When the system is started
- And the system stops
- Then the stop is rejected with a TimeoutError "The component emailListener timed out after 10ms while stopping"
- And emailListener's failed stop event carries that error
- And the failed system stop event carries that error
- And postgres has not stopped
- And the recorded events are:

  | event                     | component     | reason  | payload               |
  |---------------------------|---------------|---------|-----------------------|
  | system_start_initiated    |               |         | name                  |
  | component_start_initiated | postgres      |         | name                  |
  | component_start_succeeded | postgres      |         | name, duration        |
  | component_start_initiated | emailListener |         | name                  |
  | component_start_succeeded | emailListener |         | name, duration        |
  | component_start_initiated | httpServer    |         | name                  |
  | component_start_succeeded | httpServer    |         | name, duration        |
  | system_start_succeeded    |               |         | name, duration        |
  | system_stop_initiated     |               |         | name                  |
  | component_stop_initiated  | httpServer    |         | name                  |
  | component_stop_succeeded  | httpServer    |         | name, duration        |
  | component_stop_initiated  | emailListener |         | name                  |
  | component_stop_failed     | emailListener |         | name, error, duration |
  | component_stop_skipped    | postgres      | failure | name, reason          |
  | system_stop_failed        |               |         | name, error, duration |

## Rule: A single timeout bounds both the start and the stop

### Scenario: A component which hangs while starting

- Given the components postgres, emailListener
- And each component starts
- And each component stops
- And emailListener hangs while starting
- And emailListener has a timeout of 10ms
- When the system starts
- Then the start is rejected with a TimeoutError "The component emailListener timed out after 10ms while starting"

### Scenario: A component which hangs while stopping

- Given the components postgres, emailListener
- And each component starts
- And each component stops
- And emailListener hangs while stopping
- And emailListener has a timeout of 10ms
- When the system is started
- And the system stops
- Then the stop is rejected with a TimeoutError "The component emailListener timed out after 10ms while stopping"

## Rule: The signal fires only for an abortable component

### Scenario: An abortable component

- Given the components postgres, emailListener
- And each component starts
- And each component stops
- And emailListener is abortable
- And emailListener hangs while starting
- And emailListener has a start timeout of 10ms
- When the system starts
- Then the start is rejected with a TimeoutError "The component emailListener timed out after 10ms while starting"
- And emailListener's start was given an abort signal which has fired with that error

### Scenario: A component which cannot be aborted

- Given the components postgres, emailListener
- And each component starts
- And each component stops
- And emailListener hangs while starting
- And emailListener has a start timeout of 10ms
- When the system starts
- Then the start is rejected with a TimeoutError "The component emailListener timed out after 10ms while starting"
- And emailListener's start was given an abort signal which has not fired

### Scenario: An abortable component which honours its own timeout has still failed

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener is abortable
- And emailListener starts on demand
- And emailListener has a start timeout of 10ms
- When the system starts
- And the timeout has expired
- And emailListener has aborted
- Then the start is rejected with a TimeoutError "The component emailListener timed out after 10ms while starting"
- And emailListener's start was given an abort signal which has fired with that error
- And the recorded events are:

  | event                     | component     | reason  |
  |---------------------------|---------------|---------|
  | system_start_initiated    |               |         |
  | component_start_initiated | postgres      |         |
  | component_start_succeeded | postgres      |         |
  | component_start_initiated | emailListener |         |
  | component_start_failed    | emailListener |         |
  | component_start_skipped   | httpServer    | failure |
  | system_start_failed       |               |         |
  | system_stop_initiated     |               |         |
  | component_stop_skipped    | httpServer    | failure |
  | component_stop_skipped    | emailListener | failure |
  | component_stop_initiated  | postgres      |         |
  | component_stop_succeeded  | postgres      |         |
  | system_stop_succeeded     |               |         |

## Rule: Whichever bound is sooner wins

### Scenario: A component's start timeout sooner than the system's

- Given the components postgres, emailListener, httpServer
- And the system has a start timeout of 1000ms
- And each component starts
- And each component stops
- And emailListener hangs while starting
- And emailListener has a start timeout of 10ms
- When the system starts
- Then the start is rejected with a TimeoutError "The component emailListener timed out after 10ms while starting"
- And the recorded events are:

  | event                     | component     | reason  |
  |---------------------------|---------------|---------|
  | system_start_initiated    |               |         |
  | component_start_initiated | postgres      |         |
  | component_start_succeeded | postgres      |         |
  | component_start_initiated | emailListener |         |
  | component_start_failed    | emailListener |         |
  | component_start_skipped   | httpServer    | failure |
  | system_start_failed       |               |         |
  | system_stop_initiated     |               |         |
  | component_stop_skipped    | httpServer    | failure |
  | component_stop_skipped    | emailListener | failure |
  | component_stop_initiated  | postgres      |         |
  | component_stop_succeeded  | postgres      |         |
  | system_stop_succeeded     |               |         |

### Scenario: The system's start timeout sooner than a component's

- Given the components postgres, emailListener, httpServer
- And the system has a start timeout of 10ms
- And each component starts
- And each component stops
- And emailListener is abortable
- And emailListener starts on demand
- And emailListener has a start timeout of 1000ms
- When the system starts
- And the timeout has expired
- And emailListener has aborted
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for emailListener to start"
- And emailListener's start was given an abort signal which has fired with that error
- And the recorded events are:

  | event                     | component     | reason  |
  |---------------------------|---------------|---------|
  | system_start_initiated    |               |         |
  | component_start_initiated | postgres      |         |
  | component_start_succeeded | postgres      |         |
  | component_start_initiated | emailListener |         |
  | system_stop_initiated     |               |         |
  | component_start_aborted   | emailListener | timeout |
  | component_start_skipped   | httpServer    | timeout |
  | system_start_failed       |               |         |
  | component_stop_skipped    | httpServer    | timeout |
  | component_stop_skipped    | emailListener | abort   |
  | component_stop_initiated  | postgres      |         |
  | component_stop_succeeded  | postgres      |         |
  | system_stop_succeeded     |               |         |

### Scenario: The system's stop timeout sooner than a component's

- Given the components postgres, emailListener
- And the system has a stop timeout of 10ms
- And each component starts
- And each component stops
- And emailListener hangs while stopping
- And emailListener has a stop timeout of 1000ms
- When the system is started
- And the system stops
- Then the stop is rejected with a TimeoutError "The stop timed out after 10ms waiting for emailListener to stop"
- And emailListener's failed stop event carries that error
- And postgres has not stopped

### Scenario: A component's own timeout expiring while the system waits for it

- Given the components postgres, emailListener, httpServer
- And the system has a start timeout of 10ms
- And each component starts
- And each component stops
- And emailListener hangs while starting
- And emailListener has a start timeout of 20ms
- When the system starts
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for emailListener to start"
- And emailListener's failed start event carries a TimeoutError "The component emailListener timed out after 20ms while starting"
- And the recorded events are:

  | event                     | component     | reason  |
  |---------------------------|---------------|---------|
  | system_start_initiated    |               |         |
  | component_start_initiated | postgres      |         |
  | component_start_succeeded | postgres      |         |
  | component_start_initiated | emailListener |         |
  | system_stop_initiated     |               |         |
  | component_start_failed    | emailListener |         |
  | component_start_skipped   | httpServer    | timeout |
  | system_start_failed       |               |         |
  | component_stop_skipped    | httpServer    | timeout |
  | component_stop_skipped    | emailListener | failure |
  | component_stop_initiated  | postgres      |         |
  | component_stop_succeeded  | postgres      |         |
  | system_stop_succeeded     |               |         |
