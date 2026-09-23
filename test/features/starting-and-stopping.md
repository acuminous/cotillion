# Feature: Starting and stopping

A system starts its components, then stops them again. A system with no components has
nothing to start or stop, and is the smallest thing cotillion has to get right.

## Background:

- Given the system's events are recorded

## Scenario: A system with no components

- Given a system with no components
- When the system is started
- Then the start values are empty
- When the system is stopped
- Then the recorded events are:

  | event                  |
  |------------------------|
  | system_start_initiated |
  | system_start_succeeded |
  | system_stop_initiated  |
  | system_stop_succeeded  |

## Rule: Components start one at a time, in declaration order

### Scenario: Each component starts only once the previous one has

- Given the components postgres, emailListener, httpServer
- And each component starts on demand
- When the system starts
- Then postgres is starting
- And emailListener has not started
- When postgres has started
- Then emailListener is starting
- And httpServer has not started
- When emailListener has started
- Then httpServer is starting
- When httpServer has started
- Then the system has started

## Rule: Components stop one at a time, in reverse start order

### Scenario: Each component stops only once the one after it has

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- Then httpServer is stopping
- And emailListener has not stopped
- When httpServer has stopped
- Then emailListener is stopping
- And postgres has not stopped
- When emailListener has stopped
- Then postgres is stopping
- When postgres has stopped
- Then the system has stopped
- And the recorded invocations are:

  | lifecycle | component     |
  |-----------|---------------|
  | start     | postgres      |
  | start     | emailListener |
  | start     | httpServer    |
  | stop      | httpServer    |
  | stop      | emailListener |
  | stop      | postgres      |

### Scenario: A component with no stop function

- Given the components postgres, migrate, httpServer
- And each component starts
- And each component stops
- And migrate has no stop function
- When the system is started
- And the system is stopped
- Then migrate has not stopped
- And the recorded invocations are:

  | lifecycle | component  |
  |-----------|------------|
  | start     | postgres   |
  | start     | migrate    |
  | start     | httpServer |
  | stop      | httpServer |
  | stop      | postgres   |

### Scenario: A component with no start function is still stopped

- Given the components postgres, migrate, httpServer
- And each component starts
- And each component stops
- And migrate has no start function
- When the system is started
- And the system is stopped
- Then migrate has not started
- And migrate has stopped once

## Rule: Every invocation is given an abort signal

### Scenario: The argument a [lifecycle] function receives

- Given the components postgres
- And each component starts
- And each component stops
- When the system is started
- And the system is stopped
- Then postgres's [lifecycle] was given an abort signal which has not been aborted
- And postgres's [lifecycle] was given no other arguments

### Examples:

| lifecycle |
|-----------|
| start     |
| stop      |

## Rule: The start values are keyed by component name

### Scenario: Components which return something from starting

- Given the components postgres, httpServer
- And postgres starts with a connection
- And httpServer starts with a listener
- When the system is started
- Then the start values are:

  | component  | value        |
  |------------|--------------|
  | postgres   | a connection |
  | httpServer | a listener   |

### Scenario: A component with no start function

- Given the components postgres, migrate
- And postgres starts with a connection
- And migrate has no start function
- When the system is started
- Then migrate has not started
- And the start values are:

  | component | value        |
  |-----------|--------------|
  | postgres  | a connection |
  | migrate   |              |

### Scenario: A component which starts without returning anything

- Given the components postgres, migrate
- And postgres starts with a connection
- And migrate starts without returning a value
- When the system is started
- Then migrate has started once
- And the start values are:

  | component | value        |
  |-----------|--------------|
  | postgres  | a connection |
  | migrate   |              |

## Rule: Starting is idempotent

### Scenario: Starting a system which has already started

- Given the components postgres
- And postgres starts with a connection
- When the system is started
- And the system is started
- Then postgres has started once
- And both starts resolve to the same start values

### Scenario: Starting a system which is already starting

- Given the components postgres
- And each component starts on demand
- When the system starts
- And the system starts
- When postgres has started
- Then postgres has started once
- And both starts resolve to the same start values

### Scenario: Starting a system which has been stopped

- Given the components postgres
- And postgres starts with a connection
- When the system is started
- And the system is stopped
- And the system is started
- Then postgres has started twice
- And the two starts resolve to different start values

## Rule: Stopping is idempotent

### Scenario: Stopping a system which has already stopped

- Given the components postgres
- And each component starts
- And each component stops
- When the system is started
- And the system is stopped
- And the system is stopped
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
  | system_stop_initiated     |
  | component_stop_skipped    |
  | system_stop_succeeded     |

### Scenario: Stopping a system which is already stopping

- Given the components postgres
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- And the system stops
- When postgres has stopped
- Then postgres has stopped once
- And both stops resolve

### Scenario: Stopping a system which was never started

- Given the components postgres
- And each component starts
- And each component stops
- When the system is stopped
- Then postgres has not started
- And postgres has not stopped
- And the recorded events are:

  | event                  |
  |------------------------|
  | system_stop_initiated  |
  | component_stop_skipped |
  | system_stop_succeeded  |

## Rule: A start which fails leaves the components which had started standing

### Scenario: A component fails to start

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener fails to start
- When the system starts
- Then the start is rejected with emailListener's error
- And the recorded invocations are:

  | lifecycle | component     |
  |-----------|---------------|
  | start     | postgres      |
  | start     | emailListener |

### Scenario: Stopping after a start which failed

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

## Rule: A stop which fails leaves the earlier components untouched

### Scenario: A component fails to stop

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops
- And emailListener fails to stop
- When the system is started
- And the system stops
- Then the stop is rejected with emailListener's error
- And the recorded invocations are:

  | lifecycle | component     |
  |-----------|---------------|
  | start     | postgres      |
  | start     | emailListener |
  | start     | httpServer    |
  | stop      | httpServer    |
  | stop      | emailListener |

## Rule: A stop which did not finish can be retried

### Scenario: Stopping again after a stop which failed

- Given the components postgres, emailListener, httpServer
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- And httpServer has stopped
- And emailListener has failed to stop
- Then the stop is rejected with emailListener's error
- When the system stops
- And emailListener has stopped
- And postgres has stopped
- Then the system has stopped
- And the recorded invocations are:

  | lifecycle | component     |
  |-----------|---------------|
  | start     | postgres      |
  | start     | emailListener |
  | start     | httpServer    |
  | stop      | httpServer    |
  | stop      | emailListener |
  | stop      | emailListener |
  | stop      | postgres      |

## Rule: A stopped system can be started again

### Scenario: Starting, stopping, starting and stopping again

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- When the system is started
- And the system is stopped
- And the system is started
- And the system is stopped
- Then the recorded invocations are:

  | lifecycle | component  |
  |-----------|------------|
  | start     | postgres   |
  | start     | httpServer |
  | stop      | httpServer |
  | stop      | postgres   |
  | start     | postgres   |
  | start     | httpServer |
  | stop      | httpServer |
  | stop      | postgres   |

## Rule: Restarting is a stop followed by a start

### Scenario: Restarting a started system

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- When the system is started
- And the system is restarted
- Then the two starts resolve to different start values
- And the recorded invocations are:

  | lifecycle | component  |
  |-----------|------------|
  | start     | postgres   |
  | start     | httpServer |
  | stop      | httpServer |
  | stop      | postgres   |
  | start     | postgres   |
  | start     | httpServer |

### Scenario: Restarting a system which was never started

- Given the components postgres, httpServer
- And each component starts
- And each component stops
- When the system is restarted
- Then postgres has not stopped
- And httpServer has not stopped
- And the recorded invocations are:

  | lifecycle | component  |
  |-----------|------------|
  | start     | postgres   |
  | start     | httpServer |
