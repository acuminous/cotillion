# Contributing to cotillion

## Architecture

One entry point, deliberately little behind it. `createSystem(definition, options)` validates
the system definition eagerly (unique names throughout, well-formed entries) and the options
(the system's start and stop timeouts), then hands them to a runner which walks the definition
forwards on start and backwards on stop, each operation bounded by its timeout. A stop which
arrives during a start interrupts it: abortable components are signalled, the rest are waited
for, and the stop then proceeds through whatever started. The system is
an EventEmitter; events are notifications only and must never carry behaviour the promise
contract does not. The public error types (TimeoutError, AbortError) live in
their own module. The README is the specification: every behaviour it documents is asserted by
a test, and the module layout stays as small as that specification allows.

| Module                     | Holds                                                                            |
|----------------------------|----------------------------------------------------------------------------------|
| lib/index.js               | createSystem, and the public exports                                             |
| lib/events.js              | the event names, as ComponentEvent and SystemEvent, and the skip reasons         |
| lib/errors.js              | the public error types                                                           |
| lib/deadline.js            | an operation's deadline: its timer, its signal, and the interruption it records   |
| lib/waits.js               | the invocations in flight, how each ended, each component's own timeout, and the stop timeout deeming one failed |
| lib/timer.js               | a clearable timer which is a no-op without a delay, shared by the deadlines and the waits |
| lib/validate-definition.js | the eager validation createSystem applies to the system definition               |
| lib/validate-options.js    | the eager validation createSystem applies to its options                         |
| lib/validate-timeout.js    | the timeout shape check the two validations share                                |
| lib/validate-events.js     | the eager validation stopOn applies to its process events                        |
| lib/index.d.ts             | the hand-written type definitions, importing only Node's EventEmitter type       |

The table grows as the implementation lands; the conventions below are binding from the first
commit.

## Code conventions

The house style, per [yadda's CONTRIBUTORS.md](https://github.com/acuminous/yadda/blob/master/CONTRIBUTORS.md):

- **Plain CommonJS in lib/**, no build step. TypeScript exists only in the hand-written
  lib/index.d.ts, test/types/ and documentation examples.
- **The d.ts is a first-class deliverable.** No any, no as-casts. Its types are structural and
  import only Node's EventEmitter type, which the system is, so they survive every module
  resolution; npm run typecheck proves it under NodeNext and Bundler. The typed components
  object (each property's type inferred from its definition's start function) and the typed
  events are part of the public contract and are asserted in test/types/.
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
- **No comments.** Not what, and not why either. Code that needs explaining needs better names
  or smaller functions, and a reason worth recording belongs in the commit message or the
  issue, where it stays true. The only exceptions are the directives a tool reads, such as
  biome-ignore and ts-expect-error.
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
  README's language (system, definition, component, start, stop, abort, skip), and every behaviour the
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
  parallel group, a stop which interrupts a start, a stop which times out. Each documented
  behaviour was written as a failing test before the code existed. Keep it that way: when a
  check is load-bearing, break the code and watch the test fail.
- **Follow [yadda's best practices](https://github.com/acuminous/yadda/blob/master/docs/best-practices.md)**,
  which are binding here too: concrete component names over item1 and userA, dictionary terms
  rather than anonymous captures, conversion at the dictionary boundary, example tables for
  variations, rules to group scenarios, and natural grammar even when it costs the
  implementation something. The feature is the specification; implementation complexity
  belongs below it.

## The test harness

The harness is small but four of its properties were found by reading yadda's source rather
than its README, and each one fails quietly when forgotten.

- **The recorder refuses undocumented events.** It wraps the system's emit, so an event outside
  the exported names fails the scenario which announced it, and the harness asserts after the
  suite that every exported name was announced by some scenario. The README conformance feature
  closes the loop by asserting the exported names against the README's tables, both ways.
- **Markdown features need their own file search.** yadda's FeatureFileSearch matches only
  .feature, .spec and .specification, so test/features.test.js uses FileSearch with an
  explicit /\.md$/ pattern and a MarkdownFeatureFileParser. A feature added under another
  extension will simply not run.
- **Scenario state lives on a nested world object.** yadda flattens a fresh context for each
  step, so a value assigned to the context itself is lost before the next step. The runner
  passes `{ world }` and steps destructure it.
- **Steps are promise based, never callback based.** yadda treats a macro as callback style
  when its arity is one more than the captured arguments, so `async ({ world }) => {}` is
  awaited correctly but `async ({ world }, next) => {}` would be handed a callback it never
  calls, and the step would hang.
- **Every step library is registered in the runner.** createInstance takes the array of
  libraries; a library nobody passes produces an undefined step error rather than silence.

Two conventions sit on top of that. The event recorder in test/lib listens for every event
name the library exports, so a scenario asserting a trace proves both what was announced and
what was not; assert traces as markdown tables, whose columns the step compares selectively,
so a scenario asks only for the columns it cares about. Definitions are written in
test/features in the README's own array notation, `postgres, [[migrate, emailListener],
smsListener], httpServer`, where bare words become component definitions, brackets become
groups, and numbers and quoted strings stay literal so a scenario can exercise a malformed
entry.

## Time and cancellation discipline

Each start's AbortSignal is derived from the start being interrupted (by a stop or the start
timeout) and the component's own start timeout, and fires only for a component declared
abortable; all waiting flows through those signals and the operation deadlines, with no
polling, no scattered setTimeout calls and no Date.now() in the decision path. Cotillion
never makes a component stop, it decides how long to keep waiting, and that wait is bounded
only by what the definition and options declared: the component's timeouts and the system's.
If a new site needs to know about cancellation, thread the signal in as a parameter.

## Decisions

Decisions of record live in the closed GitHub issues, each closed with a comment stating what
was decided, why, and what evidence settled it, with the alternative sketched so it can be
overruled cheaply. When behaviour is deliberately surprising, the issue and the commit message
carry the reasoning; the code itself stays uncommented. If you find yourself writing "cannot"
in a proposal, check whether you mean "chose not to": a genuine cannot deserves a probe or a
named mechanism in the same breath, and a chose-not-to deserves the alternative sketched so
the maintainer can overrule cheaply.

## Contributions

Consider opening an issue before implementing an improvement: the maintainer may have
valuable input. Pull requests include automated tests, per the testing conventions above.

## Changelog

The changelog begins with the first release: until then the README says what the library does
and the closed issues say how it came to. From the first release on, every meaningful change
updates CHANGELOG.md in the same commit that makes it: a behaviour change, a new capability, a
deprecation, a bug fixed, a new example. Not internal refactoring that nobody consuming the
library could observe. The entry says what changed and why it matters to somebody using it, not
which files moved, kept in the Keep a Changelog sections under Unreleased until a release is
cut.

## Gates

npm run lint (biome check: lint, format and import order, exactly what CI enforces), npm run
typecheck, and npm test all green before a commit; the pre-commit hook runs them.
