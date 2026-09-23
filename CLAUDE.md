# Claude Code: cotillion

Graceful orchestration of network components: sequential start, reverse-order stop, overall
timeouts, aborting. The README is the specification; the architecture, code conventions,
testing conventions and time discipline live in [CONTRIBUTING.md](CONTRIBUTING.md), which is
binding. Development history and decisions live in the closed GitHub issues. The notes below
are what a session needs beyond them.

## How to work

- **The README is the definition of done.** Every documented behaviour is demonstrated by a
  test that would fail if it regressed, and every behaviour change updates the README in the
  same commit. Do not weaken, skip or delete an existing test to get a new one passing; when
  a test asserts behaviour a decision has overruled, replace it and say so.
- **Test-first where it bites**: ordering guarantees, error contracts, event sequences,
  timeout and abort semantics are written as failing yadda scenarios before the code
  exists.
- **Verify load-bearing claims empirically.** Break the code and watch the test fail; read
  the installed Node version's AbortSignal behaviour rather than assuming it. A "cannot"
  without a probe or a named mechanism is probably a "chose not to": present those as
  decisions with the alternative sketched, so the maintainer can overrule cheaply.
- **Finish cleanly**: the gates in CONTRIBUTING.md all green, one commit per issue or
  coherent change, message explaining why rather than what. Track work in GitHub issues and
  close each with a comment recording what was decided and what evidence settled it.

## Writing yadda scenarios

CONTRIBUTING.md's test harness section lists four properties of the harness that fail quietly
when forgotten; read it before adding a feature, along with
[yadda's best practices](https://github.com/acuminous/yadda/blob/master/docs/best-practices.md).
Beyond those:

- **A feature is a markdown file under test/features/**, its steps in a library under
  test/steps/ which must be passed to createInstance in test/features.test.js, and its helpers
  in test/lib/. A library nobody registers gives an undefined step, not a warning.
- **Group scenarios with Rule headings and vary them with Examples tables.** Both the scenario
  title and the steps take `[column]` substitution, so each generated scenario names its own
  case rather than repeating one title three times.
- **Every Then asserts something the step library observed.** A Then which restates what the
  preceding When just assigned asserts nothing. If an outcome is not observable, the scenario
  is telling you the library needs to announce it, which is usually an event.
- **Assert event sequences as markdown tables**, one row per event. The recorder listens for
  every name the library exports, so the trace proves what was not announced as well as what
  was, and the step compares only the columns the table declares.
- **Keep the grammar natural even when the automation suffers**, per yadda's rule 4: an
  article column beats generating "a abort timeout", and a step alias beats a contorted
  sentence.
- **Write the scenario first and watch it fail for the right reason**, then again after the
  implementation by breaking it deliberately. A scenario that has never failed has not been
  shown to assert anything.

## When to stop and ask the maintainer

Stop and report, rather than silently deviating, when a documented behaviour is impossible or
two documented behaviours contradict each other, when Node's AbortSignal or timer behaviour
differs from what the code assumes, or when a production dependency seems warranted. A short
note stating the conflict, the options and your recommendation is the deliverable, not a
workaround.

## Dependencies

Zero production dependencies and no peer dependencies. This is a deliberate stance on
maintenance and supply-chain risk, and nothing this library does is large enough to outsource.
Dev dependency changes need the maintainer's agreement.
