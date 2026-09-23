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
