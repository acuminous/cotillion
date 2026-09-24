# Feature: Parallel groups

A nested array is a parallel group. Its entries start concurrently, and the group is one step in
the enclosing sequence: the next component does not start until every entry of the group has. On
stop the order reverses around the group, and its entries stop concurrently. Nesting alternates:
the top level is a sequence, a nested array is a group, and an array inside a group is a sequence
running alongside its siblings, to any depth.

A group settles before a failure propagates, so cotillion always knows which components started
and stops exactly those. One failure propagates as itself; several as an AggregateError holding
every one. A stop failure inside a group is treated the same way.

## Background:

- Given the system's events are recorded

## Rule: A group's entries start concurrently, and the group is one step

### Scenario: The component after the group waits for the whole group

- Given the components postgres, [emailListener, smsListener], httpServer
- And each component starts on demand
- When the system starts
- And postgres has started
- Then emailListener is starting
- And smsListener is starting
- And httpServer has not started
- When smsListener has started
- Then httpServer has not started
- When emailListener has started
- Then httpServer is starting
- When httpServer has started
- Then the system has started

## Rule: A group's entries stop concurrently, after the components which followed it

### Scenario: The component before the group waits for the whole group

- Given the components postgres, [emailListener, smsListener], httpServer
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- Then httpServer is stopping
- And emailListener has not stopped
- And smsListener has not stopped
- When httpServer has stopped
- Then emailListener is stopping
- And smsListener is stopping
- And postgres has not stopped
- When emailListener has stopped
- Then postgres has not stopped
- When smsListener has stopped
- Then postgres is stopping
- When postgres has stopped
- Then the system has stopped

## Rule: A sequence inside a group runs alongside its siblings

### Scenario: Starting a sequence inside a group

- Given the components postgres, [[migrate, emailListener], smsListener], httpServer
- And each component starts on demand
- When the system starts
- And postgres has started
- Then migrate is starting
- And smsListener is starting
- And emailListener has not started
- When migrate has started
- Then emailListener is starting
- And httpServer has not started
- When smsListener has started
- And emailListener has started
- Then httpServer is starting

### Scenario: Stopping a sequence inside a group

- Given the components postgres, [[migrate, emailListener], smsListener], httpServer
- And each component starts
- And each component stops on demand
- When the system is started
- And the system stops
- And httpServer has stopped
- Then emailListener is stopping
- And smsListener is stopping
- And migrate has not stopped
- When emailListener has stopped
- Then migrate is stopping
- And postgres has not stopped
- When smsListener has stopped
- And migrate has stopped
- Then postgres is stopping

### Scenario: Nesting three deep

- Given the components postgres, [[migrate, [emailListener, smsListener]], pushListener], httpServer
- And each component starts on demand
- When the system starts
- And postgres has started
- Then migrate is starting
- And pushListener is starting
- And emailListener has not started
- When migrate has started
- Then emailListener is starting
- And smsListener is starting
- And httpServer has not started
- When emailListener has started
- And smsListener has started
- And pushListener has started
- Then httpServer is starting

## Rule: Every component is given the components which had started before it

### Scenario: Siblings do not see each other, but a sequence sees its own earlier members

- Given the components postgres, [[migrate, emailListener], [smsListener, pushListener]], httpServer
- And postgres starts with a connection
- And migrate starts with a migration
- And emailListener starts with a subscription
- And smsListener starts with a client
- And pushListener starts with a channel
- And httpServer starts with a listener
- When the system is started
- Then the components are:

  | name          | component      |
  |---------------|----------------|
  | postgres      | a connection   |
  | migrate       | a migration    |
  | emailListener | a subscription |
  | smsListener   | a client       |
  | pushListener  | a channel      |
  | httpServer    | a listener     |

- And migrate's start was given the components:

  | name     | component    |
  |----------|--------------|
  | postgres | a connection |

- And emailListener's start was given the components:

  | name     | component    |
  |----------|--------------|
  | postgres | a connection |
  | migrate  | a migration  |

- And pushListener's start was given the components:

  | name        | component    |
  |-------------|--------------|
  | postgres    | a connection |
  | smsListener | a client     |

- And httpServer's start was given the components:

  | name          | component      |
  |---------------|----------------|
  | postgres      | a connection   |
  | migrate       | a migration    |
  | emailListener | a subscription |
  | smsListener   | a client       |
  | pushListener  | a channel      |

## Rule: A group settles before a failure propagates

### Scenario: One entry fails while its sibling is still starting

- Given the components postgres, [emailListener, smsListener], httpServer
- And each component starts
- And each component stops
- And postgres starts on demand
- And emailListener fails to start
- And smsListener starts on demand
- When the system starts
- And postgres has started
- Then smsListener is starting
- And the start is still in progress
- When smsListener has started
- Then the start is rejected with emailListener's error
- And httpServer has not started
- And smsListener has stopped once
- And the recorded events are:

  | event                     | component     | reason  |
  |---------------------------|---------------|---------|
  | system_start_initiated    |               |         |
  | component_start_initiated | postgres      |         |
  | component_start_succeeded | postgres      |         |
  | component_start_initiated | emailListener |         |
  | component_start_initiated | smsListener   |         |
  | component_start_failed    | emailListener |         |
  | component_start_succeeded | smsListener   |         |
  | component_start_skipped   | httpServer    | failure |
  | system_start_failed       |               |         |
  | system_stop_initiated     |               |         |
  | component_stop_skipped    | httpServer    | failure |
  | component_stop_skipped    | emailListener | failure |
  | component_stop_initiated  | smsListener   |         |
  | component_stop_succeeded  | smsListener   |         |
  | component_stop_initiated  | postgres      |         |
  | component_stop_succeeded  | postgres      |         |
  | system_stop_succeeded     |               |         |

### Scenario: Two entries fail

- Given the components postgres, [emailListener, smsListener], httpServer
- And each component starts
- And each component stops
- And emailListener fails to start
- And smsListener fails to start
- When the system starts
- Then the start is rejected with an AggregateError "The components emailListener and smsListener failed to start"
- And that error contains the errors of emailListener, smsListener
- And httpServer has not started
- And postgres has stopped once

### Scenario: A sequence which fails inside a group

- Given the components postgres, [[migrate, emailListener], smsListener], httpServer
- And each component starts
- And each component stops
- And migrate fails to start
- When the system starts
- Then the start is rejected with migrate's error
- And emailListener has not started
- And smsListener has started once
- And smsListener has stopped once

## Rule: A group settles before a stop failure propagates

### Scenario: One entry fails to stop

- Given the components postgres, [emailListener, smsListener], httpServer
- And each component starts
- And each component stops
- And emailListener fails to stop
- When the system is started
- And the system stops
- Then the stop is rejected with emailListener's error
- And smsListener has stopped once
- And postgres has not stopped

### Scenario: Two entries fail to stop

- Given the components postgres, [emailListener, smsListener], httpServer
- And each component starts
- And each component stops
- And emailListener fails to stop
- And smsListener fails to stop
- When the system is started
- And the system stops
- Then the stop is rejected with an AggregateError "The components emailListener and smsListener failed to stop"
- And that error contains the errors of emailListener, smsListener
- And postgres has not stopped

## Rule: A timeout mid-group names every component in flight

### Scenario: The start timeout expires with two entries in flight

- Given the components postgres, [emailListener, smsListener], httpServer
- And the system has a start timeout of 10ms
- And each component starts
- And each component stops
- And emailListener is abortable
- And smsListener is abortable
- And emailListener starts on demand
- And smsListener starts on demand
- When the system starts
- And the timeout has expired
- And emailListener has aborted
- And smsListener has aborted
- Then the start is rejected with a TimeoutError "The start timed out after 10ms waiting for emailListener and smsListener to start"
- And httpServer has not started
- And postgres has stopped once
