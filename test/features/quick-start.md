# Feature: Quick start

The README's quick start, run. A stand-in takes the place of the postgres client, since pg is not
a dependency, and the HTTP server is a real one listening on a free port, reached in-process. The
system is created with the quick start's timeouts and bound to a process event in place of the
termination signals; exiting is left to the reader, as the README leaves it.

## Background:

- Given the system's events are recorded

## Scenario: The quick start, started, serving and stopped

- Given the quick start's components
- And the system stops on the process events shutdown
- When the system is started
- Then the HTTP server answers a request with the database's reply
- When the process emits shutdown
- Then the HTTP server has closed
- And the database client has ended
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
