# Feature: Component events

A system announces each component as it starts and stops, so a caller can log progress without
instrumenting the components themselves. Each listener receives a single payload object: the
component's name, plus the component's own error when it failed, or a reason when it was skipped.

The events are notifications. They never change what start() and stop() resolve or reject with,
and a system nobody is listening to behaves exactly like one somebody is.

## Rule: Every component is announced as the system starts and stops

### Background:

- Given the system's events are recorded

### Scenario: A system which starts and stops cleanly

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- When the system is started
- And the system is stopped
- Then the recorded events are:

  | event                     | component  | payload        |
  |---------------------------|------------|----------------|
  | system_start_initiated    |            | name           |
  | component_start_initiated | postgres   | name           |
  | component_start_succeeded | postgres   | name, duration |
  | component_start_initiated | httpServer | name           |
  | component_start_succeeded | httpServer | name, duration |
  | system_start_succeeded    |            | name, duration |
  | system_stop_initiated     |            | name           |
  | component_stop_initiated  | httpServer | name           |
  | component_stop_succeeded  | httpServer | name, duration |
  | component_stop_initiated  | postgres   | name           |
  | component_stop_succeeded  | postgres   | name, duration |
  | system_stop_succeeded     |            | name, duration |

### Scenario: A system which was never started

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- When the system is stopped
- Then the recorded events are:

  | event                  | component  | reason  | payload        |
  |------------------------|------------|---------|----------------|
  | system_stop_initiated  |            |         | name           |
  | component_stop_skipped | httpServer | stopped | name, reason   |
  | component_stop_skipped | postgres   | stopped | name, reason   |
  | system_stop_succeeded  |            |         | name, duration |

## Rule: A component is announced before its function runs and after it settles

### Background:

- Given the system's events are recorded

### Scenario: A component's start is announced around the start function

- Given the components postgres, httpServer
- And each component starts on demand
- When the system starts
- Then postgres is starting
- And the recorded events are:

  | event                     | component |
  |---------------------------|-----------|
  | system_start_initiated    |           |
  | component_start_initiated | postgres  |

- When postgres has started
- Then the recorded events are:

  | event                     | component  |
  |---------------------------|------------|
  | system_start_initiated    |            |
  | component_start_initiated | postgres   |
  | component_start_succeeded | postgres   |
  | component_start_initiated | httpServer |

### Scenario: A component's stop is announced around the stop function

- Given the components postgres, httpServer
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- Then httpServer is stopping
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

- When httpServer has stopped
- Then the recorded events are:

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

## Rule: A component with no function for the operation is skipped as missing

### Background:

- Given the system's events are recorded

### Scenario: A component with no start function

- Given the components postgres, migrate, httpServer
- And each component starts
- And migrate has no start function
- When the system is started
- Then the recorded events are:

  | event                     | component  | reason  | payload        |
  |---------------------------|------------|---------|----------------|
  | system_start_initiated    |            |         | name           |
  | component_start_initiated | postgres   |         | name           |
  | component_start_succeeded | postgres   |         | name, duration |
  | component_start_skipped   | migrate    | missing | name, reason   |
  | component_start_initiated | httpServer |         | name           |
  | component_start_succeeded | httpServer |         | name, duration |
  | system_start_succeeded    |            |         | name, duration |

### Scenario: A component with no stop function

- Given the components postgres, migrate
- And each component starts
- And each component stops
- And migrate has no stop function
- When the system is started
- And the system is stopped
- Then the recorded events are:

  | event                     | component | reason  | payload        |
  |---------------------------|-----------|---------|----------------|
  | system_start_initiated    |           |         | name           |
  | component_start_initiated | postgres  |         | name           |
  | component_start_succeeded | postgres  |         | name, duration |
  | component_start_initiated | migrate   |         | name           |
  | component_start_succeeded | migrate   |         | name, duration |
  | system_start_succeeded    |           |         | name, duration |
  | system_stop_initiated     |           |         | name           |
  | component_stop_skipped    | migrate   | missing | name, reason   |
  | component_stop_initiated  | postgres  |         | name           |
  | component_stop_succeeded  | postgres  |         | name, duration |
  | system_stop_succeeded     |           |         | name, duration |

## Rule: A component already in the state the operation wants is skipped

### Background:

- Given the system's events are recorded

### Scenario: Starting a system which has already started

- Given the components postgres
- And each component starts
- When the system is started
- And the system is started
- Then postgres has started once
- And the recorded events are:

  | event                     | component | reason  | payload        |
  |---------------------------|-----------|---------|----------------|
  | system_start_initiated    |           |         | name           |
  | component_start_initiated | postgres  |         | name           |
  | component_start_succeeded | postgres  |         | name, duration |
  | system_start_succeeded    |           |         | name, duration |
  | system_start_initiated    |           |         | name           |
  | component_start_skipped   | postgres  | started | name, reason   |
  | system_start_succeeded    |           |         | name, duration |

### Scenario: Stopping a system which has already stopped

- Given the components postgres
- And each component starts
- And each component stops
- When the system is started
- And the system is stopped
- And the system is stopped
- Then postgres has stopped once
- And the recorded events are:

  | event                     | component | reason  | payload        |
  |---------------------------|-----------|---------|----------------|
  | system_start_initiated    |           |         | name           |
  | component_start_initiated | postgres  |         | name           |
  | component_start_succeeded | postgres  |         | name, duration |
  | system_start_succeeded    |           |         | name, duration |
  | system_stop_initiated     |           |         | name           |
  | component_stop_initiated  | postgres  |         | name           |
  | component_stop_succeeded  | postgres  |         | name, duration |
  | system_stop_succeeded     |           |         | name, duration |
  | system_stop_initiated     |           |         | name           |
  | component_stop_skipped    | postgres  | stopped | name, reason   |
  | system_stop_succeeded     |           |         | name, duration |

## Rule: A failure skips the components the operation never reaches

### Background:

- Given the system's events are recorded

### Scenario: A component fails to start

- Given the components postgres, emailListener, httpServer
- And each component starts
- And emailListener fails to start
- When the system starts
- Then the start is rejected with emailListener's error
- And the failed component start event carries emailListener's error
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
  | component_stop_skipped    | postgres      | missing | name, reason          |
  | system_stop_succeeded     |               |         | name, duration        |

### Scenario: Stopping again after a start which failed

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener fails to start
- When the system starts
- Then the start is rejected with emailListener's error
- When the system is stopped
- Then the recorded events are:

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
  | system_stop_initiated     |               |         | name                  |
  | component_stop_skipped    | httpServer    | stopped | name, reason          |
  | component_stop_skipped    | emailListener | stopped | name, reason          |
  | component_stop_skipped    | postgres      | stopped | name, reason          |
  | system_stop_succeeded     |               |         | name, duration        |

### Scenario: A component with no start function after the one which failed

- Given the components postgres, emailListener, migrate
- And each component starts
- And migrate has no start function
- And emailListener fails to start
- When the system starts
- Then the start is rejected with emailListener's error
- And the recorded events are:

  | event                     | component     | reason  | payload               |
  |---------------------------|---------------|---------|-----------------------|
  | system_start_initiated    |               |         | name                  |
  | component_start_initiated | postgres      |         | name                  |
  | component_start_succeeded | postgres      |         | name, duration        |
  | component_start_initiated | emailListener |         | name                  |
  | component_start_failed    | emailListener |         | name, error, duration |
  | component_start_skipped   | migrate       | failure | name, reason          |
  | system_start_failed       |               |         | name, error, duration |
  | system_stop_initiated     |               |         | name                  |
  | component_stop_skipped    | migrate       | failure | name, reason          |
  | component_stop_skipped    | emailListener | failure | name, reason          |
  | component_stop_skipped    | postgres      | missing | name, reason          |
  | system_stop_succeeded     |               |         | name, duration        |

### Scenario: A component fails to stop

- Given the components postgres, emailListener
- And each component starts
- And each component stops
- And emailListener fails to stop
- When the system is started
- And the system stops
- Then the stop is rejected with emailListener's error
- And the failed component stop event carries emailListener's error
- And the recorded events are:

  | event                     | component     | reason  | payload               |
  |---------------------------|---------------|---------|-----------------------|
  | system_start_initiated    |               |         | name                  |
  | component_start_initiated | postgres      |         | name                  |
  | component_start_succeeded | postgres      |         | name, duration        |
  | component_start_initiated | emailListener |         | name                  |
  | component_start_succeeded | emailListener |         | name, duration        |
  | system_start_succeeded    |               |         | name, duration        |
  | system_stop_initiated     |               |         | name                  |
  | component_stop_initiated  | emailListener |         | name                  |
  | component_stop_failed     | emailListener |         | name, error, duration |
  | component_stop_skipped    | postgres      | failure | name, reason          |
  | system_stop_failed        |               |         | name, error, duration |

## Rule: The events which end a start or a stop say how long it took

### Background:

- Given the system's events are recorded

### Scenario: Durations on a start and a stop

- Given the components postgres
- And each component starts on demand
- And each component stops on demand
- When the system starts
- And postgres has started
- And the system stops
- And postgres has stopped
- Then postgres's succeeded start event carries a duration
- And postgres's succeeded stop event carries a duration
- And the succeeded system start event carries a duration no shorter than postgres's
- And the succeeded system stop event carries a duration no shorter than postgres's

### Scenario: Durations on a failed start and its automatic stop

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- And httpServer fails to start
- When the system starts
- Then the start is rejected with httpServer's error
- And httpServer's failed start event carries a duration
- And the failed system start event carries a duration no shorter than httpServer's

## Rule: Events are notifications, never behaviour

### Scenario: A system nobody is listening to

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener fails to start
- When the system starts
- Then the start is rejected with emailListener's error
- When the system is stopped
- Then the recorded invocations are:

  | lifecycle | component     |
  |-----------|---------------|
  | start     | postgres      |
  | start     | emailListener |
  | stop      | postgres      |
