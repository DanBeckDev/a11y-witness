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

> **The rule: if it is open, it is on this page.** Detail may live in a record entry, and this page links
> to it rather than restating it — a fact stated twice is this repo's most-repeated defect, and two
> copies of a status is exactly the shape that drifts. `backlog.test.ts` enforces one direction of that:
> any record heading marked `— OPEN` must appear here.

---

## Open defects

| | what would tell you it is fixed | detail |
|---|---|---|
| **A capture stalled for 3.5 hours and neither timeout fired** — the worker's 520 s hard bound and the host's 600 s `waitForWorker` both exist and neither ended it. The wedge itself is understood (a notification toast held the foreground, so Edge could never take focus); why two independent bounds failed is not. | A capture that exceeds its bound is abandoned and the run says so — reproduced deliberately, not waited for. | no record entry; found 2026-09-02 on `a11y-worker-6` |
| **Readiness treats a non-modal foreground window as harmless** — `noBlockingDialog` looks for modals, so a toast leaves the worker reporting `ready: true` while nothing can take focus. Detection is manual and took 3.5 hours. | `/health` reports not-ready when a foreground window belongs to another process; `fleet:recover` stops being the thing a human has to think of. | no record entry |
| **The report says "untested" for criteria axe answered in the same run** — `criterionOutcomes()` builds from `assessedCriteria()`, the screen-reader layer only, so 3.1.1, 1.3.5 and 2.5.3 print *"No assessor in this tool covers this criterion"* after axe checked them. The join key already exists. | A default scan of a page with no `lang` reports 3.1.1 failed, naming axe as assessor; `--no-axe` reports it untested again. | [known-gaps §26](./known-gaps.md) |
| **Ten of the 28 model features read a `0` that means "nobody asked"** — every structured feature is `float(bool(channel))` and `any([])` is `False`, so "the page has none" and "nothing looked" are one number. | The featurizer reads `observed`, and a retrain does not reintroduce the vetoes that masking produced. | [not-working §11](./not-working.md), and §15 for the attempt that was refuted |
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

## Blocked on a decision that is not mine

| | |
|---|---|
| **npm publish — never done** | Needs credentials, the `"access": "restricted"` → `"public"` flip, `NPM_TOKEN`, and a human typing `publish-for-real`. Run `release:gate` on the lab first, not the CI subset. [not-working §8](./not-working.md) |
| **4.1.3 has no real-page grounding** | [known-gaps §21](./known-gaps.md). ADR 0024 is the route; it needs the forms work built, then a real site with a configured form. |

---

## How an item leaves this page

Delete the row, and put the *lesson* in the record — `known-gaps.md` for something the project did not
yet do, `not-working.md` for something that was wrong. A closed row that stays here is how a tracker
becomes a second record and stops being read.
