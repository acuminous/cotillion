# Feature: README conformance

The README is the specification, so the parts of it which can be checked mechanically are. The
two events tables must name exactly the events the library exports, and the recorder which every
scenario uses refuses any event outside those exports, so an event can neither be announced
without being documented nor documented without being announced. The errors table must name
exactly the error types the library constructs. And the promises the README makes about the
package must match the package.

## Rule: The events tables mirror the exported event names

### Scenario: The component events table

- Given the README
- Then its component events table lists exactly the exported component events

### Scenario: The system events table

- Given the README
- Then its system events table lists exactly the exported system events

## Rule: The errors table mirrors the errors the library constructs

### Scenario: The errors table

- Given the README
- Then its errors table lists exactly the error types the library constructs

## Rule: The README's promises about the package hold

### Scenario: The Node.js requirement

- Given the README
- Then the Node.js version it requires is the one the package declares

### Scenario: No production dependencies

- Given the README
- Then the package has no production dependencies

### Scenario: Cotillion never calls process.exit

- Given the README
- Then the library never calls process.exit
