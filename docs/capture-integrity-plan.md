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

**Status: MET 2026-08-29.** `sweepCompleteness` in `packages/evidence/src/verify.ts`, reaching the rules
through `oracleCounts` -> `RuleInput.completeness`. Host-side deliberately: `parseAnnouncement` is the
single announcement grammar and it is TypeScript the plain-node worker cannot import.

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

**Status: MET 2026-08-29.** `assertableSweep` refuses `phantom` and `truncated`; `sweep-completeness.test.ts`
DISCOVERS every rule reading a sweep and requires it to be gated or exempted with a reason. Mutation-checked
three ways.

**What the search found, and it is not what the plan assumed.** Only ONE asserting rule concludes from a
sweep — 2.1.1, plus the sweep half of 4.1.2's mixed-channel call. The other candidates were already safe and
for good reasons worth recording: `addMissingHeadings` and `addUnnamedGraphics` decide on the CENSUS and use
the sweep only as corroboration or in the evidence string, and 2.4.3 was moved to the transcript on
2026-08-25 precisely because the sweep cannot answer ordering.

**Two judgements had to be made explicit rather than buried.**

- **`unknown` is ALLOWED, and counted.** Every capture predating the counter reports it, so refusing there
  would silence 2.1.1 across the whole corpus and read as a model regression. `unverifiedSweeps` reports
  how many assertions rest on it — a number, because "some are unverified" cannot say whether it is two or
  two thousand.
- **Only the untrustworthy CHANNEL is dropped, never the whole call.** 4.1.2 reads the sweep and the focus
  probe together; silencing the probe because the sweep is in doubt trades a real finding for a caution
  about a different measurement.

**Measured before and after, as this item required: 26 pages, 25 rule findings, unchanged.** Every type on
every local capture reads `unknown`, so the guard is correct and protects nothing until a recapture. That
is the honest statement of where this stands.

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

**Status: MET 2026-08-29 for the dominant cause, which was DEFINITIONAL.**

The 97% headline was about half instrument and half arithmetic. `collectPhrase` dedupes, so `structure.links`
is a list of distinct ANNOUNCEMENTS; the census counted ELEMENTS. Measured across 106 real captures, 75% of
named elements share a name with another and every page has duplicates, so the two were never comparable:

```
median sweep / raw element count     0.24
median sweep / DISTINCT name count   0.49
tfl graphics:      20 vs 34 (truncated -14)  ->  20 vs 19 (phantom +1)
scotcourts links:  sweep 1 vs 22 distinct    <- a REAL failure the noise had buried
```

The census now counts distinct names per type, and completeness compares NAMES rather than announcements —
"Contact, heading, level 2" and "level 3" are one name and two announcements. What remains after that is the
finding rather than the artefact, and `scotcourts` is the proof it was worth separating.

**`formControl` was added for C2**, counting the roles NVDA's `f` quick-nav actually visits. `dom.formField`
is a narrower set and is 2.1.2's denominator; comparing the sweep against it would report a phantom on every
page carrying a button — two alphabets compared as one, which is this plan's own subject.

**Still open:** attributing the residual per-kind disagreement to specific causes with counts. That needs a
recapture to produce captures carrying `distinct`, since every capture on disk predates it.

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

**Status: DECIDED 2026-08-29 — ADR 0023. Capture the page as it is, and RECORD the banner.**

Dismissing is refused on the project's OWN existing rule rather than a new one: `probeForms` is off in the
CLI because "pressing *Book* on a stranger's site is not a review", and clicking *Accept all* is a stronger
version of that act. Capturing both is not refused on principle — it is the most truthful answer and buys
nothing until the recording exists, because without it a reader cannot tell the two captures apart.

**The banner was never the defect. A finding that could not say which page it described was.**

`consentBanner()` reports two things that must never be merged, and merging them is a mistake already made
here: a metric once said *"50 of 86 captures read the site's furniture"* by combining "has a cookie banner"
(nearly every UK government site, costs nothing) with "never got past one" (ONE page, invalidates everything
downstream). `present` is context; `blocking` is a defect, and a blocking banner outranks every per-type
completeness verdict — an exact sweep of a dialog is the most confident way to be wrong.

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

**Status: MET 2026-08-29.** `comparableNames` excludes truncated announcements before normalisation — on the
announcement AS HEARD, which is what the capture marked; normalising first would make the exclusion set and
the entries two different alphabets, which is the defect being fixed. `namesExcluded` counts the exclusion.

Applied at all seven call sites reading the capture, with a DISCOVERY test requiring it, because a remedy
reaching one call site is this repo's most expensive recurring shape. Mutation-checked by removing the
exclusion and by making one call site forget it; both fail.

**A second defect fell out of it, and the existing tests caught it.** The capture wrote the truncation mark
only when it FOUND truncation, so an absent mark meant either "none" or "never checked" — and C6's naming
verdict read that silence as a clean bill of health. `explain-capture.test.ts` exists for exactly that shape
and failed. The mark is now written unconditionally with `checked: true`, and an absent mark reports that
the capture cannot say. Same rule as `refreshBrowseBuffer` marking when it skips.

A truncated announcement is not a shorter announcement, it is a different string. Comparing it by name —
which `namesOf` and `comparableNames` do everywhere — silently fails to match. That is the U+FFFC and
U+E604 class, and it is at 40%.

**Done when:** a truncated announcement is marked at the point of capture and excluded from name
comparison, with the exclusion counted rather than silent. A comparison that skipped 40% of its inputs
without saying so is the vanishing-denominator defect at the evidence layer.

## C6. Every capture states what it can support

**Status: MET 2026-08-29.** `captureSupports` returns per-type `absence`, plus `ordering` and `naming`, each
carrying its REASON rather than a bare boolean — `ok: false` alone sends a reader back to the capture to find
out which of four things went wrong.

`capture:explain` now asks it instead of keeping its own copy of `REACHED_THE_END` and its own banner regex.
That was the point of the item: three re-derivations of one fact is the shape that cost five incidents in a
day, and a reporting tool that disagrees with the rules is worse than one that says nothing.

Measured on the 26 local captures: **ordering is claimable on 11 of 26** — the rest stopped at `deadline` or
`maxSteps`, so any claim about what they contain is a claim about a prefix of the page.

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

### MEASURED 2026-08-29, mid-recapture, on protocol-7 captures

Taken 90 minutes into the corpus run rather than after it — which is why the reporting defect below was
found while it still cost nothing. Two samples of the freshest captures, scored host-side:

| | 60 captures | 80 captures |
|---|---|---|
| `heading` / `link` / `graphic` / `formControl` | **100% exact** | **100% exact** |
| `landmark` | 47 exact, 13 truncated | 64 exact, 16 truncated |
| **all five types exact** | **47/60 (78%)** | **64/80 (80%)** |
| ordering claimable | 60/60 | 80/80 |
| naming claimable | 60/60 | 80/80 |

**So the residual is ONE type, and it is attributed.** Every landmark truncation checked is the caret rule
this repo already documents — quick navigation cannot reach a landmark containing the caret, so a
page-wrapping `<main>` is missed. Verified directly on one: the tree exposes 1, the sweep announced `[]`.
That is C1 making a known limitation VISIBLE rather than silent, which is the whole point of it; an
absence claim about landmarks is now refused instead of being made on a short list.

**And a reporting defect the same measurement exposed.** The worker's own `structureCrossCheck` put
agreement at 40-51% on the same captures, with 191 `link/phantom` and 139 `landmark/truncated`, because it
compares the sweep's ENTRY COUNT against the census's distinct NAMES — it is plain node and cannot parse
an announcement. Links are 100% exact host-side. See `known-gaps.md` §13; `capture:explain` now reports
the host verdict.

## Where this stands, 2026-08-29

All six items are closed, and the honest summary is that **the machinery is in place and the evidence to
feed it is not yet on disk.** Every capture in the corpus predates `census.distinct`, `formControl` and the
unconditional truncation mark, so completeness reads `unknown` on all five types, naming reads "cannot say",
and C2's guard correctly protects nothing. Measured: 26 pages, 25 rule findings, unchanged by any of this.

**A recapture is what turns these from correct code into working guards**, and it is the cheap moment to
take it — C3's residual attribution needs the same captures.

> **CORRECTION, made the same day this was written.** The sentence here first read *"nothing here bumps
> `CAPTURE_PROTOCOL_VERSION`: what the evidence MEANS is unchanged"*. That is wrong twice over, and the
> second way is the one that matters.
>
> **It is wrong by this repo's own stated criterion.** CLAUDE.md says to bump when a change is *"a new
> field a signal reads"* — and `census.distinct`, `formControl` and the truncation mark are read by rules
> through `completeness` and `assertableSweep`. They are exactly that.
>
> **And without the bump the recapture is a no-op.** `workerCode` is deliberately NOT in `environmentKey`
> — *"it changes when a comment changes, and invalidating 1,061 pairs over a reworded comment is how a
> cache gets switched off"* — so nothing about these changes moves a cache key. `training:capture` would
> serve every cached capture unchanged and **the new fields would never appear**, while every gate stayed
> green and completeness stayed `unknown` forever. A cache that correctly serves stale-shaped evidence is
> the quietest possible failure, and it is the same shape as the memoised `browserVersion`.
>
> So the order is: **bump 6 -> 7, deploy, recapture.** The bump is not a cost imposed on the recapture, it
> is what CAUSES it. Note `worker:deploy` refuses a protocol change without `--allow-protocol-change`, and
> the trap it guards applies here — an UNCOMMITTED bump makes `worker:code` report every worker stale
> because the LOCAL hash moved.

Measured 2026-08-29: all five workers report `5be5d7838793b58e` against this checkout's `035213934be78eb4`
— `5 stale worker(s)`, fleet otherwise CONSISTENT. `assertFleetRunsThisCheckout` refuses a capture in that
state, which is the guard working.

The one number to watch afterwards is the one this plan opened with: per-kind disagreement, now that half of
it has been shown to be arithmetic rather than instrument.

### One follow-up the running corpus will NOT pick up

The recapture was dispatched at `58c4671`, and the landmark fix — reading a landmark's name from
`containers` rather than `objects` — landed after it. `sweepCompleteness` is HOST-side, so it applies
retroactively whenever a capture is READ: nothing needs recapturing for it.

But `ruleEvidence` is baked in at EXPORT time (`export-screenreader-dataset.mjs` calls `oracleCounts`
once and stores the result), so the exported dataset from this run will carry `landmark: unknown` where a
re-export would say `exact`. **Nothing consumes it** — no rule reads `structure.landmarks`, and
`assertableSweep` is only ever asked about `formControl` and `link` — so this is a reporting difference,
not a wrong assertion.

Fixing it costs one re-export, measured at **13 s** in `known-gaps.md` §1, and the captures are cached, so
it does not re-capture. Do it with the next deliberate export rather than restarting nine hours of fleet
time for a field with no consumer.

## Moved from CLAUDE.md (#458)

## A capture survives a lost socket — name it, then ask for it again

`send(res, 200, {...})` wrote the result to a socket and the worker then kept **nothing**, so any socket
loss between "NVDA finished reading the page" and "the host parsed the JSON" destroyed 12–520 s of real
screen-reader work. The host cannot tell that from a worker that never answered, so it retried and paid
for the whole capture again — and three failures in a row on one worker **evicts a machine that was never
faulty**.

On three UTM guests sharing one Mac the socket was a virtual bridge and effectively lossless, which is why
this never mattered. A fleet of bare-metal mini PCs is real Ethernet with real power management, and the
incident is already in provisioning: a worker answered `EHOSTUNREACH` for **48 straight requests** in one
evidence-check run, then answered a curl thirty seconds later.

```
POST /capture  { url, ..., captureId }     # the host NAMES the capture
GET  /capture/<captureId>                  # 404 unknown | 202 running | the original response, verbatim
```

- **The id comes from the CLIENT, and it has to.** A worker-minted id would be returned in the response —
  the very thing being lost. This is the idempotency-key shape, for the reason payment APIs use it.
- **404 and 202 are different answers and must stay that way.** 202 ("still running") means wait, do not
  start a second capture. Producing one where the other is true is this repo's most expensive recurring
  shape.
- **A failed capture is stored exactly like a successful one**, with its original status, so a replay is
  indistinguishable from the original response and the worker's `fault` code survives. Losing that
  response replaces a diagnosis with "no answer" — which this project has repeatedly misread as a dead
  machine.
- **The host asks only after `waitForWorker` returns**, which waits for `busy` to clear. So the capture it
  lost the socket to has necessarily finished and its outcome is stored. One request, no polling loop.
- **In memory, bounded at 8, never persisted.** Eviction skips anything still running — dropping a live
  capture would recreate the bug at the moment the store exists to prevent it. Persisting would mean
  serving results captured under a different `codeVersion` after a restart.
- **404 IS BOUNDED RESULT RECALL, NOT "NEVER STARTED" — architecture-audit.md §14.4, corrected 2026-09-05.**
  This used to say "never heard of it" means the capture never started and to re-issue the case. That is
  the common cause and re-issuing is still the right recovery, but it is not the only cause: the bound
  directly above means a capture that finished and was EVICTED reads exactly the same 404, and a worker
  RESTART loses the whole store the same way. So 404 means "not retained here", not "never ran" — a claim
  this in-memory, 8-entry, non-persisted store was never positioned to make. Deliberately not closed with
  payload-fingerprint duplicate suppression instead: that would still fall short of exactly-once across a
  restart, so naming the bound honestly is more useful than a mechanism that promises more than it can
  keep. Reusing an id after its result is retained (whether the SAME request or a different one) silently
  executes again with no conflict check — a caller must mint a fresh id per logical capture, which every
  real call site already does via `randomUUID()`.

This adds a route and an optional request field, so it does **not** bump `CAPTURE_PROTOCOL_VERSION` —
nothing about what the evidence *means* changed, and a bump would invalidate 2,122 captures for a
recovery path. It does change `codeVersion()`, so redeploy. An older worker ignores `captureId`
(`captureOptions` reads known fields only) and 404s the GET from its router fallback, which the host reads
as "nothing to recover" and captures again — the behaviour it had before. Additive, exactly like `fault`.


### A canary that cannot express the fault is worthless

This was got wrong three times in one day, and each time the clean result was read as confirmation:

- verified an autofill fix on `field-followup-date`, which does **not** auto-focus its input — so the
  affordance never appeared and 12 clean captures proved nothing. `form-unlabelled/good` auto-focuses,
  and still failed.
- measured the artefact on `form-unlabelled/bad`, which has no date field at all.
- compared guest `.4` at 4096 MB against `.6` at 3072 MB and read the difference as a code change.

**Reproduce the fault with your test before trusting the test's verdict.** Every canary in
`stability-gate.mjs` records the mechanism it exercises; add new ones the same way.


## `evidence:check`, 2 of 48, and the `examinedNothing` guard

- `npm run evidence:check <worker>` — after ANY change to the capture pipeline, asks whether the
  evidence moved rather than whether the timing did. Exit 0 = ship without invalidating the cache,
  1 = evidence CHANGED, bump `CAPTURE_PROTOCOL_VERSION` and recapture, **2 = INCONCLUSIVE, which now
  includes PARTIAL coverage and not only zero**. It reported `2 compared: 2 same ... evidence unchanged —
  safe to ship` and exited 0 on 2 of 48, because a concurrent run stopped the page server two captures in.
  The `examinedNothing` guard's own comment named the general rule and then covered only `compared === 0`,
  calling that "the extreme case rather than a different one" — 2 of 48 is the middle it left open. The
  sample is stratified one case per family, so an uncompared capture is a FAMILY with no opinion attached,
  while the question being answered is "may I keep 2,122 cached captures?". This is what makes a capture
  optimisation affordable to evaluate; before it, every one "cost a full recapture" to find out.

## Count-based checks cannot see content rot

- **Count-based checks cannot see content rot — assert what was heard, not how much.** capture-check now gates on probe *values* (`disclosure-good` must reach `expanded`, `disclosure-bad` must stay `collapsed`) and on the read-through still carrying roles, because both lessons were learned the hard way. A readiness gate once overwrote the first line of every page with the document title, deleting the h1's `"heading, level 1, ..."` announcement everywhere: `"heading, level N"` phrases fell from 105 to 15 across 90 captures and **every check stayed green**, because the phrase count had not moved. If you change capture, compare evidence quality against a previous run, not just line counts.

## npm run identity:rate

- `npm run identity:rate -- --worker=<url> [--rounds=20]` — **does a capture ever read the wrong page?**
  Rotates three pages with mutually exclusive signatures so a stale read names which page it came from, and
  every capture after the first navigates an already-open window, because a freshly launched browser has no
  previous document and therefore cannot express the fault. Reports wrong-page, silent and unrecognised
  separately — collapsing the first two is what sent an afternoon after a stale buffer that was really a mute
  screen reader. Exits 1 on any wrong page. A zero count is printed as a 95% upper bound (rule of three), not
  as proof of absence.

## Five canary pages, and the U+FFFC autofill incident

Five canary pages, captured repeatedly, compared by CONTENT. It fails closed, and a corpus run must not
start until it passes.

It exists because the corpus carried a nondeterministic artefact for weeks with every check green.
Edge's autofill draws a suggestion icon inside recognised inputs; NVDA announces it as an embedded
object appended to the field:

```
"Recipient name, edit, ￼"      <- U+FFFC, OBJECT REPLACEMENT CHARACTER
```

**And `probeForms` submits forms, so the profile LEARNS**, and the rate climbs as a run proceeds —
measured at 3%, then 8%, then 31% of affected captures, with **26 good/bad pairs disagreeing about it**.
A pair where one side carries a stray character and the other does not is comparing two things that
differ for a reason unrelated to accessibility, which is the one defect this project cannot tolerate.

Every existing check stayed green because they all count, and the counts never moved: one form field
before, one form field after. Content comparison is the only thing that could see it.

Suppressed now with **command-line flags, not Edge policies** (`AutofillServerCommunication`,
`AutofillAddressProfileSavePrompt`, `--disable-save-password-bubble`). The policy equivalents were set
by provisioning and had *already drifted* — `StartupBoostEnabled` read 1 on two guests and 0 on a third
for weeks. A flag is in git, applied at every launch, and cannot differ between guests. Note Chromium
honours only the **last** `--disable-features`, so new features go in the existing list; a second flag
silently disables only half of what you asked for.

## eval and eval:gate, what cannot run in CI

- **Pre-release, and not covered by CI:** `npm run eval:gate` for judge quality, and
  `verify.corpus.test.ts` for the capture gates. Neither can run in CI — eval needs the Python venv
  login, the corpus test needs `runs/`. Note also that `capture-regression.yml` is path-filtered to
  `packages/lab/src/capture/**`, so it does **not** fire for changes under `packages/lab/src/training/**` — which is exactly
  where the guard bug above lived.
- `npm run eval [-- <substring>]` — judge quality against 34 labelled fixtures, **against our own scorer** (`JUDGE_BACKEND` defaults to `local`). Needs the Python venv, so it **cannot run in CI**; run it when you touch the judge, prompts, criteria, or fixtures. Do **not** quote its numbers as a headline: `docs/METHODOLOGY.md` records that the guards were tuned against these cases, scoring is single-run, and there is no expert baseline yet. Report with those caveats or not at all.

## training:check-signals and worker-troubleshooting pointers

- `npm run training:check-signals` — proves every dataset `badSignal` fires on the bad page and stays silent on the good one, against captures already on disk (no worker needed). Run it after ANY change to a probe's output shape: a probe and its signal are coupled, and 8 cases once went silently blind when a probe changed. `npm run training:status` reports a long capture run; `--resume` picks up where one stopped.
- **Worker broken? Don't debug from first principles** — `docs/nvda-worker-runbook.md` has the error-string → real-cause table (the messages are misleading: `"NVDA not installed"` usually means a version mismatch, not a missing install), and `packages/worker-fleet/src/provisioning/diagnose-nvda-worker.ps1` applies it automatically. `packages/worker-fleet/src/provisioning/provision-nvda-worker.ps1` is the idempotent repair.
- **No worker to hand?** Build one: `docs/getting-started.md` (~1.5–2 h, almost all of it downloading Windows). Validating capture changes through CI is a ~10-minute loop and should be the fallback, not the habit.
