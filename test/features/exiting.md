# Feature: Exiting

system.exit(code) stops the system and ends the process once the stop has finished, with the given
code if the stop succeeded. If the stop failed the code is kept unless it was 0 or absent, which
become 1, so a failed stop is never reported as a success and a caller's reason for exiting is never
lost. With no code the process exits with process.exitCode, which is 0 unless the program set it.
system.exitOn(...signals) does what stopOn does and calls exit() with no code when a signal arrives. Stops the application begins itself, by stop() or restart(), do not exit, so an
application can restart its system when a component fails and keep running. A failed start is not
exitOn's business either: start() rejects, and left unhandled at the top level Node ends the process
with code 1, as these programs let it. A system with nothing to stop, because it never started, has
stopped, or its start failed and the stop which follows has finished, is not stopped again: exit()
ends the process without announcing a stop. An exit code can only be seen from outside the process, so
these scenarios run a small program in a child process and read the code it exited with.

## Rule: A signal stops the system and then exits the process

### Scenario: A signal after the system has started

- Given a program whose system exits on a process event
- When the program runs
- Then the program exits with code 0
- And the program announced system_stop_succeeded before exiting

### Scenario: A termination signal after the system has started

- Given a program whose system exits on a termination signal
- When the program runs
- Then the program exits with code 0
- And the program announced system_stop_succeeded before exiting

### Scenario: A component which fails to stop

- Given a program whose system exits on a process event
- And the program's postgres fails to stop
- When the program runs
- Then the program exits with code 1
- And the program announced system_stop_failed before exiting

### Scenario: A component which fails to start

- Given a program whose system exits on a process event
- And the program's postgres fails to start
- When the program runs
- Then the program exits with code 1
- And the program announced system_start_failed before exiting
- And the program announced system_stop_succeeded before exiting

## Rule: Stops the application begins itself do not exit

### Scenario: The application restarts the system after a component failure

- Given a program whose system exits on a process event
- And the program's postgres fails after starting, and the program restarts the system
- When the program runs
- Then the program exits with code 3
- And the program announced component_failed before exiting
- And the program announced system_stop_succeeded before exiting

## Rule: Unbinding removes the listeners

### Scenario: A stop after unbinding

- Given a program whose system exits on a process event
- And the program unbinds the exit before stopping
- When the program runs
- Then the program exits with code 7
- And the program announced system_stop_succeeded before exiting

## Rule: exit() stops the system and then exits the process with the code

### Scenario: An exit with [code description] after a successful stop

- Given a program whose system exits itself with [code description]
- When the program runs
- Then the program exits with code [code]
- And the program announced system_stop_succeeded before exiting

### Examples:

| code description | code |
|------------------|------|
| no code          | 0    |
| the code 3       | 3    |

### Scenario: An exit with no code after the program set process.exitCode

- Given a program whose system exits itself with no code
- And the program sets process.exitCode to 5 before exiting
- When the program runs
- Then the program exits with code 5
- And the program announced system_stop_succeeded before exiting

### Scenario: An exit while the system is starting

- Given a program whose system exits itself with the code 3 while starting
- When the program runs
- Then the program exits with code 3
- And the program announced system_stop_succeeded before exiting

## Rule: An exit with nothing to stop does not stop again

### Scenario: An exit from the rejection of a failed start

- Given a program whose system exits itself with the code 1 when the start fails
- And the program's postgres fails to start
- When the program runs
- Then the program exits with code 1
- And before exiting the program announced:

  | event                     |
  |---------------------------|
  | system_start_initiated    |
  | component_start_initiated |
  | component_start_failed    |
  | system_start_failed       |
  | system_stop_initiated     |
  | component_stop_skipped    |
  | system_stop_succeeded     |

### Scenario: An exit after the system has stopped

- Given a program whose system exits itself with the code 3 after stopping
- When the program runs
- Then the program exits with code 3
- And before exiting the program announced:

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

### Scenario: An exit of a system which was never started

- Given a program whose system exits itself with the code 3 without starting
- When the program runs
- Then the program exits with code 3
- And before exiting the program announced:

  | event |
  |-------|

### Scenario: An exit after a stop which failed stops again

- Given a program whose system exits itself with the code 3 after stopping
- And the program's postgres fails to stop
- When the program runs
- Then the program exits with code 3
- And before exiting the program announced:

  | event                     |
  |---------------------------|
  | system_start_initiated    |
  | component_start_initiated |
  | component_start_succeeded |
  | system_start_succeeded    |
  | system_stop_initiated     |
  | component_stop_initiated  |
  | component_stop_failed     |
  | system_stop_failed        |
  | system_stop_initiated     |
  | component_stop_initiated  |
  | component_stop_failed     |
  | system_stop_failed        |

## Rule: A failed stop exits with the caller's non-zero code, or 1

### Scenario: An exit with [code description] after a failed stop

- Given a program whose system exits itself with [code description]
- And the program's postgres fails to stop
- When the program runs
- Then the program exits with code [code]
- And the program announced system_stop_failed before exiting

### Examples:

| code description | code |
|------------------|------|
| no code          | 1    |
| the code 0       | 1    |
| the code 3       | 3    |

## Rule: The exit code is an integer

### Scenario: The exit code [value]

- Given the components postgres
- When the system is asked to exit with the code [value]
- Then the request is rejected with "The exit code must be an integer"

### Examples:

| value  |
|--------|
| 3.5    |
| "3"    |
| true   |
