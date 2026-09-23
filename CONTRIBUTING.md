# Contributing to cotillion

## Architecture

One entry point, deliberately little behind it. `createSystem(components)` validates the
component tree eagerly (unique names throughout, well-formed components), then hands it to a
runner which walks it forwards on start and backwards on stop, racing each operation against
a single AbortSignal derived from the overall timeout or an `abort()` call. The system is
an EventEmitter; events are notifications only and must never carry behaviour the promise
contract does not. The public error types (TimeoutError, AbortError) live in
their own module. The README is the specification: every behaviour it documents is asserted by
a test, and the module layout stays as small as that specification allows. This section grows
a module table as the implementation lands; the conventions below are binding from the first
commit.

## Code conventions

The house style, per [yadda's CONTRIBUTORS.md](https://github.com/acuminous/yadda/blob/master/CONTRIBUTORS.md):

- **Plain CommonJS in lib/**, no build step. TypeScript exists only in the hand-written
  lib/index.d.ts, test/types/ and documentation examples.
- **The d.ts is a first-class deliverable.** No any, no as-casts. Its types are structural and
  import nothing, so they survive every module resolution. The typed start-value object (each
  property's type inferred from its component's start function) is part of the public
  contract and is asserted in test/types/.
- **Very small functions**, averaging a few lines. If a comment is coming on, extract a named
  function instead.
- **Avoid else and switch.** They typically hide a fork in behaviour that is better handled
  with polymorphism. Guard clauses that return or throw early are fine; other forks become
  lookup maps of named functions.
- **Avoid boolean parameters.** They lead to conditional branches: prefer two named
  functions, an enum, or a named option. Boolean fields on data objects are fine.
- **Favour composition and duck typing over inheritance.** No classical hierarchies. The one
  sanctioned exception is the system extending Node's EventEmitter, which the README
  specifies.
- **Encapsulate: do not leak primitives.** When software leaks primitives, bad things
  happen. Keep state private with closures rather than accessor and mutator patterns, and
  export exactly the public API in lib/index.d.ts; everything else stays module-private,
  even when exporting would make a test easier.
- **Comments explain why, never what.** The only acceptable comments explain why irreducibly
  confusing code cannot be simpler: workarounds, awkward algorithms. Simplify instead.
- **Zero production dependencies.** Everything this library needs is small enough to own.
  Propose a dependency in an issue rather than adding one.
- **Naming**: camelCase identifiers, matching the public API the README specifies
  (createSystem, stopOn). yadda's internal snake_case is historical to yadda and does not
  transfer; cotillion's snake_case event names are specification, not identifier style.
- **British English** in identifiers, messages and docs. No em-dashes, and no backticks
  inside markdown tables.

## Testing conventions

- **BDD with [yadda](https://github.com/acuminous/yadda)**, not plain unit tests. Behaviour
  lives in feature specs (GitHub-flavoured markdown) under test/features/, with step
  libraries under test/steps/ and shared helpers under test/lib/, executed through node:test
  via yadda's node:test plugin, the whole suite via npm test. Scenarios are written in the
  README's language (system, component, start, stop, abort, skip), and every behaviour the
  README documents traces to a scenario.
- **No mocks.** Test components are real components: plain objects whose start and stop
  functions record their invocations and settle on demand through deferred promises. A
  recorder like that is a test double, not a mock, and that is fine.
- **No sleeps.** Ordering is asserted exactly, from the recorded invocation sequence, never
  inferred from wall-clock time. Tests control when a component's start or stop settles, so
  no assertion ever races real time. Timeout and abort tests use deferred components
  which never settle, with short real timeouts where a timer is unavoidable.
- **Error messages are part of the contract**: error tests assert the message content, and a
  README test keeps the error table complete in both directions.
- **The awkward paths are the point of the library**: partial start failure, timeout during a
  parallel group, abort during stop, a second stop after an aborted one. Each documented
  behaviour was written as a failing test before the code existed. Keep it that way: when a
  check is load-bearing, break the code and watch the test fail.

## Time and cancellation discipline

Each invocation's AbortSignal is derived from the operation's signal (overall timeout or
`abort()`) and the component's own timeout; all waiting flows through those signals, with
no polling, no scattered setTimeout calls and no Date.now() in the decision path. Cotillion
never makes a component stop, it decides how long to keep waiting, and that wait is bounded
only by what the caller declared: an abort timeout, or a repeated `abort()`. If a new site
needs to know about cancellation, thread the signal in as a parameter.

## Decisions

Decisions of record live in the closed GitHub issues, each closed with a comment stating what
was decided, why, and what evidence settled it, with the alternative sketched so it can be
overruled cheaply. When behaviour is deliberately surprising, the reasoning also lives as a
comment at the point of use. If you find yourself writing "cannot" in a proposal, check whether you mean "chose not
to": a genuine cannot deserves a probe or a named mechanism in the same breath, and a
chose-not-to deserves the alternative sketched so the maintainer can overrule cheaply.

## Contributions

Consider opening an issue before implementing an improvement: the maintainer may have
valuable input. Pull requests include automated tests, per the testing conventions above.

## Changelog

Every meaningful change updates CHANGELOG.md in the same commit that makes it: a behaviour
change, a new capability, a deprecation, a bug fixed, a new example. Not internal refactoring
that nobody consuming the library could observe. The entry says what changed and why it
matters to somebody using it, not which files moved.

Keep it in the Keep a Changelog sections, under Unreleased until a release is cut. A change
worth a commit message explaining why is almost always worth a line here, and the commit is
the moment to write it, not the release.

## Gates

npm run lint (biome check: lint, format and import order, exactly what CI enforces), npm run
typecheck, and npm test all green before a commit; the pre-commit hook runs them.
