# Making the capture trustworthy

Written 2026-08-29, after being told — correctly — that the capture defects in this project have been fixed
one at a time as they surfaced, and that nobody had asked what is structurally wrong with how a page is
captured. That is the right criticism. Focus mode, U+FFFC, the caret rule, D7, the transport: each fix was
sound, each was reactive, and each was found *after* it had already contaminated a corpus.

This plan starts from measurement instead.

## What the corpus actually says

Measured across **106 real-page captures** with `capture:explain`'s predicates:

| | | |
|---|---|---|
| **97%** | the sweep disagrees with the accessibility tree | `link/phantom` 70 · `heading/truncated` 58 · `landmark/phantom` 58 · `graphic/truncated` 42 · `heading/phantom` 37 · `landmark/truncated` 36 |
| **55%** | the page opens on a consent banner | so the evidence describes the page WITH a banner over it |
| **40%** | carry truncated announcements | a truncated name cannot be matched against anything |
| **4%** | the read was cut short (5 of 106) | `maxSteps`; the rest reached `repeatBottom` or `wrap` |
| **100%** | cannot say whether the page moved between probes | they predate D7's fingerprint |

**The first number is the one that matters, and it points in two directions at once.** *Phantom* means the
sweep announced more elements than the tree exposes; *truncated* means it announced fewer. Both are defects
in the instrument, they have different causes, and **the capture already computes this and nothing reads
it.**

> **A caution about that 97%, because the first attempt at this measurement was wrong.** `capture:explain`
> initially reported "the read did NOT finish" on **106 of 106** captures — a 100% failure rate that was
> entirely an artefact of treating `repeatBottom` and `wrap` as failures when they are how a read reaches
> the end. A diagnostic built to stop confident wrong answers produced one at its first use. The real
> figure is 4%. Every number above has been re-derived since; `REACHED_THE_END` is now read off
> `phraseAction` rather than guessed from the names, and a test pins it.

## The root, stated once

**The sweep is treated as a census when it is a sample, and nothing downstream knows the difference.**

`structure.headings`, `structure.links`, `structure.formFields` are what NVDA announced during a quick-nav
walk. Rules read them as *what the page has*. On 97% of real pages that is untrue in one direction or the
other, and the divergence is silent because the sweep's own output looks the same either way: a list.

Every capture defect this project has recorded is a special case of it —

| | |
|---|---|
| quick-nav cannot reach the element the caret is on | one element lost per type, per caret position |
| the sweep stops on a repeated phrase | graphics 5 of 66 on a page with four identical avatar alts |
| focus mode types quick-nav keys into the page | 353 captures found 0 links, 0 graphics, 0 lists |
| a container prefix parsed as a control | `"form Continue"` became a control name |
| truncation | 40% of real captures, and a truncated name matches nothing |

— and each was found by accident, after the fact, by someone noticing an odd number.

---

## C1. Completeness becomes a FIELD, per element type

**Status: open. Everything else here depends on it.**

`structureCrossCheck` already compares the sweep against the tree, per type, and records
`{type, sweep, elementsList, kind}` where `kind` is `phantom` or `truncated`. It is a diagnostic nobody
reads, and `diagnostics` is on the exporter's `FORBIDDEN_INPUT_KEYS`, so no rule can reach it.

Make it evidence: alongside `structure.headings`, a `structure.completeness.heading` of
`exact | truncated | phantom | unknown`.

**Done when:**

- Every capture carries a per-type completeness verdict, and `oracleCounts` exposes it to the rules the way
  `census` and `dom` already are — one extraction step, not six.
- `unknown` is a distinct value from `exact`, and no code path may treat absence as agreement. This is the
  defect this project pays for most often, and a completeness field that defaulted to "fine" would be the
  most expensive instance of it yet.
- The exporter carries it in `ruleEvidence`, not `input`: it is an oracle, and `docs/local-model.md` forbids
  the accessibility tree as a model feature.

## C2. A rule that reads ABSENCE must refuse incomplete evidence

**Status: open. This is what C1 is for.**

Absence is the one claim a sweep cannot make alone — the rule this repo already states and then applies by
hand, in the two places somebody remembered. `addMissingHeadings` requires `census.heading === 0`;
`tabOrderCanProveAbsence` checks `channelRelation.disjoint`. Nothing enforces that the *next* absence rule
does either.

**Done when:**

- A discovery test finds every rule that concludes from an empty or short list and requires it to consult
  completeness — the same shape as `rule-oracles.test.ts` for `oracleCounts`.
- On a capture whose relevant type is `truncated`, those rules produce `cantTell`, never `failed`. A
  criterion the tool ASSERTS must not rest on a list we know is short.
- Measured before and after on `rules:gate`: the catch rate must not move on the corpus, where captures are
  hermetic and complete. If it does, the corpus is not as complete as assumed and that is worth knowing.

## C3. Find out WHY phantom and truncated happen — they are different faults

**Status: open. Diagnosis, not repair, and it must come before C4.**

70 `link/phantom` and 58 `heading/truncated` are not one bug. Candidate causes exist for each and none has
been measured:

- **truncated** — the caret rule (one element per type, per position), the repeated-phrase stop, focus mode,
  a sweep budget.
- **phantom** — one announcement parsed as several (`"Submit Search, graphic, button"` was already found to
  be two), container prefixes counted as elements, an element announced twice from two channels.

**Done when:**

- Each `kind` is attributed to a cause with a count, over the whole corpus, and the attribution is a script
  rather than an afternoon of reading captures.
- The cheap ones are fixed and re-measured; the structural ones are recorded with what they would cost.
- **`h1` is the specific case to check first.** `heading/truncated` at 58 and `heading/phantom` at 37 on the
  same corpus suggests both directions on the same type, which one cause cannot explain.

## C4. Decide what a consent banner IS

**Status: open. A product decision, and 55% of real pages wait on it.**

Over half the real-page corpus opens behind a banner. Today that is invisible to every rule: a capture of
"the page" is a capture of the banner plus whatever was reachable behind it. Three coherent answers, and
the project currently has none of them:

| | |
|---|---|
| **capture it as it is** | honest — this IS what a first-time visitor meets. Then a finding must SAY so, and "no headings" means "no headings reachable past the banner" |
| **dismiss it and capture the page** | what a returning visitor sees. Requires clicking somebody else's button, which `probeForms`' own rule says is not a review |
| **capture both** | the truthful answer and twice the cost; it also makes the banner itself assessable, which is a real accessibility question |

**Done when:** one is chosen, the reason is written down, and the capture records which it did — so a
reader of a finding knows which page it describes.

## C5. Truncation must never be comparable

**Status: open. 40% of captures, and it corrupts by NAME.**

A truncated announcement is not a shorter announcement, it is a different string. Comparing it by name —
which `namesOf` and `comparableNames` do everywhere — silently fails to match. That is the U+FFFC and
U+E604 class, and it is at 40%.

**Done when:** a truncated announcement is marked at the point of capture and excluded from name
comparison, with the exclusion counted rather than silent. A comparison that skipped 40% of its inputs
without saying so is the vanishing-denominator defect at the evidence layer.

## C6. Every capture states what it can support

**Status: open. The property that makes the rest checkable.**

`capture:explain` computes this by reading marks after the fact. The CAPTURE should compute it, so the
corpus, the gates and a finding can all cite the same answer instead of three tools re-deriving it.

**Done when:** a capture carries `supports: { absence: boolean, ordering: boolean, naming: boolean }` with
reasons, `check-signals` refuses a case whose evidence cannot support the claim its signal makes, and a
CLI finding can say *"this rests on a capture that reached the end and agreed with the tree"* or decline.

---

## What this plan is NOT

- **Not "replace the sweep with the tree".** The sweep IS the evidence — what a screen reader announced is
  the whole point, and `docs/local-model.md` forbids the tree as a model feature. The tree is the ORACLE
  that says whether the evidence is complete. Confusing the two would turn this into an axe-core with extra
  steps.
- **Not a recapture.** C1, C2, C5 and C6 read marks that captures already carry. Only C3's fixes and C4's
  decision would change what evidence MEANS, and those are the ones to bundle behind a single
  `CAPTURE_PROTOCOL_VERSION` bump.
- **Not a rewrite of guidepup.** Considered and rejected on evidence in `determinism-plan.md`: every
  capture in the four withdrawn 2.1.2 rules was ACCURATE. The instrument reported the truth and we drew the
  wrong conclusion from it.

## How to know it worked

```bash
npm run capture:explain -- <any real page>     # says what the capture can support, and why not
```

And one number, on the corpus that produced this plan: **the 97% falls, and whatever remains is
ATTRIBUTED** — a known cause with a known cost, rather than a disagreement nobody has looked at. A capture
that knows it is incomplete is trustworthy. One that does not is the problem this plan is about.
