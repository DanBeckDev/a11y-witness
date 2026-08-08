# ADR 0011 — Task journeys: testing what a user is trying to DO, not the page they are on

**Status:** accepted as direction, **not** scheduled for 1.0
**Depends on:** ADR 0002 (layered coverage), `docs/screenreader-coverage.md`

## Context

This tool captures **one URL per run**. Every probe, every sweep and every finding is scoped to a single
page. That is a real limitation and not an obvious one, because the page-at-a-time shape is what every
other automated accessibility tool has, so it reads as the normal thing to do.

**WCAG's own conformance model says it is not sufficient.** Conformance Requirement 3, *Complete
Processes*:

> When a Web page is one of a series of Web pages presenting a process (i.e. a sequence of steps that need
> to be completed in order to accomplish an activity), all Web pages in the process conform at the
> specified level or better.

And W3C's evaluation methodology (WCAG-EM) instructs evaluators to include *complete processes* in the
sample they audit. So logging in, signing up and checking out are exactly where conformance is claimed —
and a tool that cannot cross a page boundary cannot assess any of them. Not "assesses them incompletely":
cannot assess them at all.

It is also where the failures live, and they are failures of a *kind* no single-page scan reaches:

- focus not moving to the error after a rejected submit
- a login modal that traps focus, or does not return it on close
- a client-side route change that announces nothing, so the user cannot tell the page changed (4.1.3)
- a success confirmation that is only visual
- a multi-step form whose step 2 loses the context established in step 1

### What we already do, so the gap is stated accurately

The navigation model is **not** the naive one. `docs/screenreader-coverage.md` records nine behaviours
already driven with real NVDA quick-navigation keys — heading jumps (`H`), region jumps (`D`), control
hunting (`F`), links out of context (`K`), graphics (`G`), lists (`L`), table cells (`T` +
`Ctrl+Alt+Arrow`), tab order, and a linear read. Screen-reader users do not tab element to element, and
neither does this tool.

What is missing is not a navigation mode. It is a **goal**.

The seed already exists: `--task` word-matches the user's task against announced control names to choose
one control to activate (`probeKindFor` in `capture-pure.mjs`). A journey generalises that from *pick one
control* to *pick the next action, repeatedly, until the goal is reached or provably cannot be*.

## Decision

Treat **task journeys** as the next major capability after 1.0, and record here what it requires so the
scope is honest. Not built now: 1.0 has to ship, and this is a larger change than it looks.

### What it needs, cheapest first

| # | Capability | Why it is required | Where it lands |
|---|---|---|---|
| 1 | **Type into fields** | We activate buttons and never fill anything, so a form can only ever be *rejected*, never *completed*. Half a journey is unreachable without it. | `press` into a focused edit; already listed as a gap ("Typing feedback") |
| 2 | **State across page loads** | Every capture is one URL. A journey is N captures sharing one browser session. | browser reuse (`browser-session.mjs`) already keeps the process alive; the run loop is what assumes one page |
| 3 | **Dialogs and modals** | Login is usually a modal. Focus on open, focus *return* on close, whether Escape works — a focus trap here is the classic total blocker. | already listed as a gap |
| 4 | **Decide the next action** | The agentic part: choose from the announced controls, act, re-observe. | generalises `probeKindFor` |
| 5 | **Know whether the goal was reached** | Decides whether a finding can be stated at all. | new, and the hard one |

### The evidence bar, which is the actual constraint

A page finding is small and checkable: *this control has no accessible name*. A journey finding is far
more valuable and a far more serious claim: *a screen-reader user cannot log in*.

That asymmetry sets the rule. **A journey finding may only be reported when the transcript itself is the
proof** — the ordered announcements at each step, quotable line by line, showing what the user heard and
where the information they needed was absent. A journey verdict derived from a model's judgement about a
sequence, rather than from the sequence itself, must not ship. This is the same standard already applied
to the census (`the tree is the oracle and never the evidence`) and the same reason the trained scorer
abstains off-distribution rather than guessing.

Failing to reach a goal is also **not automatically a finding**. A journey can fail because the site
requires a real account, a payment card, a CAPTCHA or a second factor. Those must be reported as *could
not complete*, distinctly from *could not complete because of an accessibility barrier* — the same
distinction this project enforces everywhere else between "we could not ask" and "the answer is no".

## Consequences

- **1.0 ships page-scoped, and must say so.** `RELEASE.md` should state plainly that findings are
  per-page and that complete processes are not assessed, because WCAG conformance for a process cannot be
  claimed from what this tool currently measures. Silence there would let a reader assume otherwise.
- Journeys need **credentials and test data**, which means secrets handling in the Action and a way to
  describe a fixture account. That is a product surface, not just a capture feature.
- Journeys have **side effects by construction** — that is the whole point of them. The `probe-forms`
  default already follows who owns the page (ON in the Action, OFF in the CLI, see ADR 0002 and
  `action.yml`); a journey capability should inherit that rule and probably tighten it.
- The real-page calibration corpus (ADR 0010) becomes more valuable, not less: journeys generate exactly
  the multi-step real-page evidence that corpus is missing.

## Alternatives considered

- **Ask an LLM to drive the browser and report whether the journey worked.** Fast to demonstrate and
  wrong for this project: the finding would rest on the model's opinion of a sequence rather than on what
  a screen reader actually said, which is the one thing this tool exists to provide. It would also be
  unfalsifiable to a customer disputing a finding.
- **Record and replay a scripted journey (Playwright-style) and screen-read each step.** Much cheaper
  than deciding actions, and genuinely useful — but it tests the path the *author* thought of, which is
  the path that works. The failures above are found by a user who cannot see, navigating by headings and
  landmarks, taking a route nobody scripted. Worth building as a stepping stone, not as the destination.
- **Stay page-scoped and document the limit.** What 1.0 does. Defensible, and the reason this ADR exists
  rather than a feature branch.
