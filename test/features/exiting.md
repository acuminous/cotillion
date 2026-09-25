# Feature: Exiting

system.exitOn(...signals) does what stopOn does and also ends the process once the stop has
finished: with code 0 after a successful stop, and with code 1 after a failed stop or after a
stop which followed a failed start. An exit code can only be seen from outside the process, so
these scenarios run a small program in a child process and read the code it exited with.

## Rule: The process exits when the system has stopped

### Scenario: A signal after the system has started

- Given a program whose system exits on a process event
- When the program runs
- Then the program exits with code 0
- And the program announced system_stop_succeeded before exiting

### Scenario: A component which fails to start

- Given a program whose system exits on a process event
- And the program's postgres fails to start
- When the program runs
- Then the program exits with code 1
- And the program announced system_start_failed before exiting
- And the program announced system_stop_succeeded before exiting

### Scenario: A component which fails to stop

- Given a program whose system exits on a process event
- And the program's postgres fails to stop
- When the program runs
- Then the program exits with code 1
- And the program announced system_stop_failed before exiting

## Rule: Unbinding removes the exit as well as the stop

### Scenario: A stop after unbinding

- Given a program whose system exits on a process event
- And the program unbinds the exit before stopping
- When the program runs
- Then the program exits with code 7
- And the program announced system_stop_succeeded before exiting
