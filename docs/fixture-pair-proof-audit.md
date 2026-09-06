# What a fixture pair actually proves, and what checks it

**2026-09-06, `agent/fixture-pairs-prove-silence`.** The commit that gave all five fixture pairs a
`good.html` sibling asserted, without checking: a bad-only fixture "cannot tell 'this rule detects the
defect' from 'this rule fires whenever it is asked'", and put "the good half produces no finding for its
sibling's criterion" in `docs/backlog.md` as the acceptance. This is that check, done properly.

## The question

For each pair, two things have to be true before it proves anything:

1. **The relevant evidence channel actually reached both captures.** A good half that produces no finding
   because the probe never ran, or the channel came back empty for an unrelated reason (a consent banner,
   a wrong CDP target, a network flake), proves nothing — it is the `check-signals` BLIND state, one layer
   out. `docs/known-gaps.md` §43 already measured this exact shape happening to the *same page* under two
   capture paths (`focusReveal`'s panel reached from one starting position and not the other), so it is
   not a hypothetical risk for this corpus specifically.
2. **The bad half still produces the finding.** A rule can go silent — "a rule can be clean because it has
   gone DEAF" is this repo's own recorded lesson (`docs/backlog.md`, 2026-08-25) — and nothing about adding
   a good sibling protects against the positive side quietly stopping.

**Neither is checked today, per pair.** What exists checks weaker, more general properties, and each gap
is named below with the exact mechanism and why it does not close.

## Per-pair answer

| pair | criterion | rule / evidence channel | proves via a real capture? |
|---|---|---|---|
| `skip-link-broken` | 2.4.1 | `addInertSkipLink` (`packages/judge/src/rules.ts:1293`), reads `interaction.routeChange` | No |
| `route-title-stale` | 2.4.2 | `addStaleRouteTitle` (`rules.ts:1149`), reads `interaction.routeChange` | No |
| `keyboard-unreachable-action` | 2.1.1 | `addKeyboardUnreachableControl` (`rules.ts:1196`), reads `structure.formFields` + `interaction.focusOrder` | No |
| `focus-order-tabindex` | 2.4.3 | `addBrokenFocusOrder` (`rules.ts:1309`), reads `transcript` + `interaction.focusOrder` | No |
| `focus-panel-undismissable-help` | 1.4.13 | `addFocusRevealFindings` (`rules.ts:611`), reads `interaction.focusReveal` | No |

All five: no per-pair, per-capture check exists. What follows is why the two things that DO run over real
captures do not close this, one at a time.

## What actually runs, and why it is not enough

### `npm run rules:real-pages` (`packages/lab/scripts/check-real-page-findings.ts`)

`currentFindings()` (`check-real-page-findings.ts:243-305`) walks every real capture and, at line 268,
**skips anything not `publishedClaim === "conformant"`** — so the bad half of every pair is invisible to
this gate by construction; it checks only the good half, and only as one entry in a whole-corpus baseline
diff (`compare()`, line 319).

That diff *would* catch a good fixture gaining an unexpected finding — but only if three things are also
true, none of which this gate can see for a specific fixture:

- **The fixture was actually captured and reached `currentFindings()` at all.** A capture that fails
  outright, or opens on a consent overlay and never reaches a heading, is either absent from `current`
  entirely or classified as `furniture`/`suspectCensus` — both of which **reduce coverage rather than
  fail** (`reportAgainstBaseline`, line 702-770). A good fixture that silently never got captured this run
  makes the gate say less, not fail.
- **The baseline for that exact URL is `[]`.** `compare()` only flags a criterion *new relative to the
  baseline*; if the good fixture's own capture had already, once, produced a spurious 2.1.1 finding and
  `--update` was run without noticing, the baseline would silently absorb it and the gate would report
  PASS on every subsequent run of the same bug.
- **Nothing else on the page produces the SAME criterion for an unrelated reason.** The check does not
  distinguish "the sibling rule fired" from "a different, correct finding on the same page happens to
  share a criterion number" — it just diffs the whole per-URL criterion set.

So this gate is a real, working check for "did this specific URL gain a NEW finding of any kind" — it is
not a check for "did the rule this pair exists to validate stay silent on evidence it actually saw".

### `npm run rules:coverage` (`packages/lab/scripts/audit-rule-coverage.ts`)

This is the gate that found the original problem (`1.4.13 — fired 15x on the corpus and never on a real
page`), and it is closer to what is needed, but at the wrong granularity. `grade()` (line 237-272) marks a
criterion `validated` the moment `count.real > 0` **anywhere in the whole real-page corpus** — not
specifically on its own fixture. For 2.1.1 in particular this is not a theoretical gap: CLAUDE.md's own
history records `2.1.1` firing on 66% of conformant real pages before an unrelated bug was fixed, which
means a real, non-fixture page producing a 2.1.1 finding (correctly or not) would satisfy this gate for
`keyboard-unreachable-action` regardless of what that fixture's own capture did.

It does have real BLIND detection — the `no-channel` grade (line 245-256) reports when *no real capture
anywhere* carries the channel a criterion needs — which is exactly right in spirit and exactly wrong in
scope for this question: it answers "has this evidence ever been collected at all", not "did THIS pair's
two captures both actually collect it".

### The static checks (`real-page-corpus.test.ts`)

Thorough on metadata — pairing is URL-derived and cannot drift (line 105-129), a failing fixture's
`witnessableAs` is checked against the case it points at (line 282-311) — and reads **no capture at all**.
It cannot see anything this audit is about, by design; it is the "cheap half" already named in the brief.

## Conclusion

**The stated acceptance — "the good half produces no finding for its sibling's criterion" — is necessary
and not sufficient**, and the missing half is exactly the one this repo has paid for before: a check that
cannot distinguish "correctly silent" from "never asked" is not a check on the property it claims to
verify. Nothing today reads a fixture pair's two captures together and asks the three real questions: was
the relevant channel present on both, does the bad one still contain the criterion, does the good one not.

This is not a refutation — there is a real, fleet-free gap — so the second half of this unit builds it:
`real-page-fixture-pairs.test.ts`, added in the next commit. It derives the five pairs and their required
channels from `REAL_PAGES`/`CRITERION_COVERAGE` rather than a second hand-written list (this repo's own
remedy for a fact stated twice), reads both captures for each pair from `runs/real-page-corpus/`, skips
honestly when a capture is absent (matching `check-real-page-findings.ts`'s own contract), and asserts all
three properties per pair. Vacuity-guarded (must find all five pairs, or the discovery is broken) and
mutation-checked against synthetic captures, since this worktree's own `runs/` copy predates the fixture
work and cannot exercise it against real evidence.
