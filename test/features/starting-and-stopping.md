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

## Rule: Every start is given an abort signal

### Scenario: The argument a start function receives

- Given the components postgres
- And postgres starts with a connection
- When the system is started
- Then postgres was given an abort signal which has not been aborted
- And postgres was given no other arguments

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
