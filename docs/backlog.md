# Backlog

**This is the one place that answers "what is open".** It was created 2026-09-02 because the answer was
previously "read 2,700 lines of two other files and infer it".

## Why this file exists, and the rule

[`known-gaps.md`](./known-gaps.md) and [`not-working.md`](./not-working.md) are **records**. They are
long-form, they are valuable, and they are where a closed item's *lesson* lives — the measurement, the
wrong turn, the thing that would have caught it. Neither is a tracker, and known-gaps says so in its own
header.

The consequence was that open work could not be found mechanically. Section numbers are not unique
(`not-working` has four `§18`, two `§20`, two `§15`, two `§14`), entries are not in numeric order, and
"closed" is spelled at least fourteen ways across the two files — `DONE`, `CLOSED`, `RESOLVED`,
`REFUTED`, `MEASURED`, `DECIDED`, `CHARACTERISED`, `EXERCISED`, `STALE`, `MOVED`, `FOUND AND CLOSED`,
`MOSTLY NOT A GAP`, `WRONG CAUSE`, `MOSTLY WRONG`. Grep cannot separate a finished item from a live one.

> **Every row is ready to pick up.** Checked 2026-09-02: each names its next action, and none of them
> needs a decision from the repository owner first. Where an item once did, the decision has been made and
> recorded — ADR 0024 for the forms consent question, and the registry check that settles `PLAN.md` B5's
> naming half. An item that turns out to need a decision does not belong here until the decision exists;
> a backlog whose rows stall on "go and ask" is a reading list.
>
> **The rule: if it is open, it is on this page.** Detail may live in a record entry, and this page links
> to it rather than restating it — a fact stated twice is this repo's most-repeated defect, and two
> copies of a status is exactly the shape that drifts. `backlog.test.ts` enforces one direction of that:
> any record heading marked `— OPEN` must appear here.

---

## The order these should be done in

The convention is [`known-gaps.md`](./known-gaps.md)'s and it is not restated lightly: **not by size, and
not by what is closest to finished — by what CONSUMES what.** Applied here it reorders the page, because
three separate items all touch the capture path and each one costs a recapture if it lands alone.

**1 — Now. Consumes nothing, and one of them is a falsehood.**

- ~~The axe reporting gap.~~ **DONE 2026-09-02** — [known-gaps §26](./known-gaps.md). Left here for one
  more read because it justifies the stage: it went first as the only item where the tool made a FALSE
  STATEMENT about its own coverage, and a wrong claim outranks a missing capability.
- **`not-working` §21 is stale.** Minutes, and a stale entry has already sent me chasing a fixed problem
  twice this week.

**2 — Before anything capture-heavy.**

- **Readiness ignores a non-modal foreground window.** This is not urgency, it is sequence: everything in
  stage 3 needs a great many captures, and this is the fault that lets a worker report `ready` while
  taking none. Fixing it after a long capture run is fixing it too late.

**3 — ONE capture-path change, ONE protocol bump, ONE recapture.**

> **This is the reordering that matters, and the reason the order section exists.** A
> `CAPTURE_PROTOCOL_VERSION` bump invalidates every cached capture — **measured at ~8 h across the five
> bare-metal boxes**, not the ~4.5 h an older document claimed. Three items below each change what a
> capture records. Landed separately that is up to three recaptures and a day of fleet time; landed
> together it is one. `CLAUDE.md` already states the rule for a single change — *"the cheap moment to pay
> it is bundled with any other pending bump"* — and nothing was applying it across a work queue.

- **[ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) — forms v1.** The largest item
  and the one that consumes the most: it adds `captureOptions`, changes what a capture may do to a page,
  and unblocks four criteria. Everything else in this stage is smaller and should ride with it.
- **The arrow-key probe** ([not-working §17](./not-working.md)) — note §17's own finding that the CORPUS
  work comes before the probe, so that ordering is internal to this item.
- **The 3.1.2 route** ([not-working §19](./not-working.md)) — a new observation, so a new protocol.

Run `npm run evidence:check` before bumping. If it reports SAME the change is evidence-neutral and the
recapture is not needed; if CHANGED, it is genuine and this is the moment to pay it once.

**4 — After the recapture, because they consume the corpus.**

- **Ten features read a `0` that means "nobody asked"** ([not-working §11](./not-working.md)). It sits
  here for two reasons. Any eventual fix is a featurizer change needing a retrain, and a retrain consumes
  the corpus — so doing it before stage 3 means doing it twice. And its first step is a MEASUREMENT
  (`job=observation-ambiguity`) against the corpus, which should be the recaptured one.
- **The pathological page** ([not-working §20](./not-working.md)) — a corpus question, answered against
  the recaptured corpus.
- **4.1.3's real-page grounding** ([known-gaps §21](./known-gaps.md)) — consumes forms v1 by definition;
  it cannot start before stage 3 finishes.

**Cannot be scheduled, and should not be given a rank.**

- **The 3.5-hour stall.** It needs a recurrence to diagnose and the instrumentation is now in place
  (`workerLogTail`, verified on the fleet). Listing it as "next" would be pretending it is actionable;
  the honest state is *armed and waiting*.

**Last, for the reason known-gaps already gives.**

- **npm publish.** *"A changeset describes weights, so it should describe the final ones."* Stage 4
  produces new weights, so publishing before it means publishing a description that stops being true.

---

## Open defects

| | what would tell you it is fixed | detail |
|---|---|---|
| **A capture stalled for 3.5 hours and neither timeout fired** — the worker's 520 s hard bound and the host's 600 s `waitForWorker` both exist and neither ended it. The wedge itself is understood (a notification toast held the foreground, so Edge could never take focus); why two independent bounds failed is not. | A capture that exceeds its bound is abandoned and the run says so — reproduced deliberately, not waited for. | no record entry; found 2026-09-02 on `a11y-worker-6` |
| **Readiness treats a non-modal foreground window as harmless** — `noBlockingDialog` looks for modals, so a toast leaves the worker reporting `ready: true` while nothing can take focus. Detection is manual and took 3.5 hours. | `/health` reports not-ready when a foreground window belongs to another process; `fleet:recover` stops being the thing a human has to think of. | no record entry |
| **Ten of the 28 model features read a `0` that means "nobody asked"** — every structured feature is `float(bool(channel))` and `any([])` is `False`, so "the page has none" and "nothing looked" are one number. **Both known routes are closed**: masking was REFUTED ([§15](./not-working.md), it cost a real finding), and feeding `observed` to the featurizer was DECIDED AGAINST ([§14](./not-working.md), it trades one shortcut for a feature correlated with capture conditions — ADR 0015's whole subject). So this needs a design, not an implementation. | **Next action, and it needs no decision:** run `npm run lab:job -- -e job=observation-ambiguity` on the authoritative corpus. §14 names exactly that evidence as what would separate a decision from a guess — how many of these zeros are capture artefacts rather than page facts. Measure first; the design follows the number. | [not-working §11](./not-working.md), with [§14](./not-working.md) and [§15](./not-working.md) for the two closed routes |
| **ONE PAGE CAPTURES PATHOLOGICALLY, and `grants-audit` is what caught it** | The page captures like its peers, or is removed with the reason recorded. | [not-working §20](./not-working.md) |
| **`not-working` §21 is stale** — it says the chain stops at `promote`; the chain now completes all nine stages. A stale entry sent me chasing a fixed problem twice this week. | The heading carries its resolution, like every other closed entry. | [not-working §21](./not-working.md) |

## Accepted designs, not yet built

| | what would tell you it is fixed | detail |
|---|---|---|
| **Form configuration by named states** — the design is settled and nothing is implemented. Unblocks 3.3.1, 3.3.3, 4.1.3 and 3.2.2 on pages we do not own, and closes the consent question rather than working around it. | `--emit-form-config` drafts a file from a real page; a configured error state makes 3.3.1 assessable on a site we do not own; an unconfigured form reports `cantTell` naming the command to run. | [ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) |

## Open opportunities — measured, not yet acted on

| | what would tell you it is fixed | detail |
|---|---|---|
| **The arrow-key gap is real** — 2.1.1 abstains via `SHARES_ONE_TAB_STOP` because a capture cannot tell *reachable by arrows* from *unreachable*. The entry also argues the ORDER: corpus before probe. | 2.1.1 stops abstaining on roving-tabindex widgets, with the corpus work done first. | [not-working §17](./not-working.md) |
| **3.1.2 Language of Parts is reachable after all** — *"What It Cannot Hear"* item 7 called it the hardest of seven on a premise that is false; `NVDAKeyCodeCommands` does expose a route. | A capture can observe a language change, and 3.1.2 leaves the unreachable list. | [not-working §19](./not-working.md) |

## Decided — not defects

Listed so nobody reopens them by mistake, including me.

| | why |
|---|---|
| **No consumer telemetry** | Settled in `SECURITY.md`. The cost is accepted and real: nobody knows how the scorer behaves on a user's pages. [not-working §6](./not-working.md) |
| **`probeForms` stays off in the CLI** | Pressing *Book* on somebody's production site is not a review. ON in the Action, because you own that app. [ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) revisits the mechanism, not the line. |
| **2.1.4 Character Key Shortcuts is assessable by neither layer** | NVDA consumes single letters as quick-nav commands, so the page never receives the keystroke. The DOM route yields *"a handler exists"*, and the criterion asks whether it can be turned off — a settings-UI judgement. axe ships no rule for it either. See the comment on `"2.1.4"` in `criterion-coverage.ts`. |

## Needs your hands, but not your judgement

Neither of these is an open question any more. The first is a procedure; the second is ordinary work that
was waiting on a decision now recorded in ADR 0024.

**npm publish.** `PLAN.md` B5 called this *"the name, and the first publish (yours)"*, and the name half
is settled: **`a11y-witness` and the `@a11y-witness` scope are both unclaimed on the registry**, checked
2026-09-02, so the names already in every `package.json` are available and nothing needs choosing. What
remains is mechanical, in this order:

1. `npm run lab:job -- -e job=release-gate` — the full gate on the lab. `release:gate:ci` is the subset a
   GitHub runner can prove and is **not** a substitute; seven of its twelve stages need the Python venv or
   the corpus.
2. Create the `@a11y-witness` scope on the publishing account, and add `NPM_TOKEN` to the repository
   secrets.
3. Flip `.changeset/config.json` `"access"` from `restricted` to `public`. The workflow refuses to publish
   while it reads `restricted`, deliberately — it is the last stop before the irreversible step.
4. Dispatch `release.yml` with `dry-run: true`. It builds, versions and packs, and stops. Its first ever
   dry run found two real defects, so do not skip it.
5. Dispatch with `dry-run: false` and `confirm: publish-for-real`, typed exactly.

The only judgement left is *when*, and the order section above answers it: after stage 4, because a
changeset describes weights and should describe the final ones. [not-working §8](./not-working.md)

**4.1.3's real-page grounding.** No longer a consent decision —
[ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) settles the mechanism, so this is
stage-4 work: build forms v1, point it at a real site with a configured error state, and 4.1.3 has
grounding. [known-gaps §21](./known-gaps.md)

---

## How an item leaves this page

Delete the row, and put the *lesson* in the record — `known-gaps.md` for something the project did not
yet do, `not-working.md` for something that was wrong. A closed row that stays here is how a tracker
becomes a second record and stops being read.
