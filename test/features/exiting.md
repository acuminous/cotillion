# Feature: Exiting

system.exitOn(...signals) does what stopOn does and also ends the process once the stop a signal
began has finished: with code 0 if the stop succeeded, and 1 if it failed. Stops the application
begins itself, by stop() or restart(), do not exit, so an application can restart its system when
a component fails and keep running. A failed start is not exitOn's business either: start()
rejects, and left unhandled at the top level Node ends the process with code 1, as these programs
let it. An exit code can only be seen from outside the process, so these scenarios run a small
program in a child process and read the code it exited with.

## Rule: A signal stops the system and then exits the process

### Scenario: A signal after the system has started

- Given a program whose system exits on a process event
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
