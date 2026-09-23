# Feature: Creating a system

A malformed system definition is a programming error, so cotillion rejects it when the system
is created rather than when it is started. The array is walked in the order it was declared,
and the first violation is the one reported.

## Rule: A well formed definition is accepted

### Scenario: A sequence of components

- Given the components postgres, emailListener, httpServer
- When the system is created
- Then the system is accepted

### Scenario: Components declaring their lifecycle and their timeouts

- Given the components postgres, emailListener
- And postgres has a start and a stop
- And postgres has a timeout of 5000
- And emailListener has a start timeout of 5000
- And emailListener has a stop timeout of 30000
- When the system is created
- Then the system is accepted

### Scenario: Groups nested three deep

- Given the components postgres, [[migrate, emailListener], smsListener], httpServer
- When the system is created
- Then the system is accepted

## Rule: Every entry defines a component

### Scenario: An entry which is not an object

- Given the components postgres, 42
- When the system is created
- Then the system is rejected with "The entry at definition[1] is not an object"

### Scenario: An entry inside a group which is not an object

- Given the components postgres, [emailListener, "smsListener"]
- When the system is created
- Then the system is rejected with "The entry at definition[1][1] is not an object"

### Scenario: A component with no name

- Given the components postgres, httpServer
- And httpServer has no name
- When the system is created
- Then the system is rejected with "The entry at definition[1] has no name"

### Scenario: A name which is not a string

- Given the components postgres
- And postgres is named 42
- When the system is created
- Then the system is rejected with "The entry at definition[0] has a name which is not a string"

## Rule: Names are unique throughout the definition

### Scenario: Two components in the same sequence share a name

- Given the components postgres, postgres
- When the system is created
- Then the system is rejected with "The component name postgres is used more than once"

### Scenario: A group repeats a name from the enclosing sequence

- Given the components postgres, [emailListener, postgres]
- When the system is created
- Then the system is rejected with "The component name postgres is used more than once"

### Scenario: Two groups at different depths share a name

- Given the components [[migrate, emailListener]], [smsListener, [migrate]]
- When the system is created
- Then the system is rejected with "The component name migrate is used more than once"

## Rule: Start and stop are functions

### Scenario: A [lifecycle] which is not a function

- Given the components postgres
- And postgres has a [lifecycle] of "soon"
- When the system is created
- Then the system is rejected with "The component postgres has a [lifecycle] which is not a function"

### Examples:

| lifecycle |
|-----------|
| start     |
| stop      |

## Rule: Timeouts are positive numbers

### Scenario: A timeout of [timeout]

- Given the components postgres
- And postgres has a timeout of [timeout]
- When the system is created
- Then the system is rejected with "The component postgres has a timeout which is not a positive number"

### Examples:

| timeout |
|---------|
| "soon"  |
| -1      |
| 0       |

### Scenario: The [key] timeout is not a positive number

- Given the components postgres
- And postgres has [article] [key] timeout of -1
- When the system is created
- Then the system is rejected with "The component postgres has [article] [key] timeout which is not a positive number"

### Examples:

| article | key   |
|---------|-------|
| a       | start |
| a       | stop  |
| an      | abort |

### Scenario: A timeout key cotillion does not recognise

- Given the components postgres
- And postgres has a finish timeout of 1000
- When the system is created
- Then the system is rejected with "The component postgres has an unknown timeout key: finish"
