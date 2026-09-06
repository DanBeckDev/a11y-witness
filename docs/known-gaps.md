# Known gaps

What this project does **not** currently do, or does not yet know. Written 2026-08-27, when all seven
gates passed together for the first time and a model shipped.

**This exists because "all gates pass" and "everything is validated" are different claims.** The gates
pass. Everything below is true at the same time, and none of it is hidden in a comment somewhere — each
entry names what is missing, what it would cost, and what would tell you it is fixed.

---

> **THIS FILE IS NOW THE RECORD, NOT THE TRACKER.** Every item below was worked and closed on
> 2026-08-27, and it is kept because *what a defect cost* is the part that stops it recurring — this
> repo's oldest habit. The list that replaced it is done too. What survives both is
> **[`not-working.md`](./not-working.md)** — not a backlog, but what this tool gets wrong, cannot do, or
> cannot show, each entry carrying what was measured and on what.

## The order these should be done in

Not by size, and **not** by what is closest to finished. By what CONSUMES what.

An earlier draft of this file put the retrain first, because it is nearly free and the model is only one
revision behind. That is the wrong order and it is worth saying why: **training consumes the corpus, and
the corpus consumes the capture path.** Retrain first and you retrain again after every item below it.
The same logic puts publishing last — a changeset describes weights, so it should describe the final ones.

> **RE-OPENED 2026-08-29 at phase B, and that is this table working rather than failing.** Every item
> below reads DONE, and then `capture-integrity-plan.md` changed the capture path again — `census.distinct`,
> `formControl`, and the truncation mark written unconditionally, shipped as `CAPTURE_PROTOCOL_VERSION 7`.
> By the rule this table states, that re-opens **C** and **D**: the corpus must be recaptured before the
> model is trained on it, or the model is trained on evidence the capture path no longer produces.
>
> The bump is what MAKES the recapture happen. `workerCode` is deliberately not a cache key, so without it
> `training:capture` would serve every cached capture unchanged and the new fields would never appear —
> completeness reading `unknown` for ever with every gate green.
>
> **And the "prove one subtype first" rule below paid for itself within the hour.** The first real capture
> after the deploy carried `"formControl": null` — a bucket added to `ROLE_BUCKET` without a top-level
> counter, so `undefined + 1` = NaN, which JSON writes as null. A full recapture would have produced 2,122
> captures carrying it.

> **CLOSED OUT 2026-08-30, and phase B re-opened a second time — by the same rule.** §13, §15, §16, §17,
> §18 and §19 were worked in one pass. Two of them changed the capture path again, so **C and D re-opened
> exactly as this table says they must**: `CAPTURE_PROTOCOL_VERSION 7 -> 8`, a full recapture, then export
> and train on evidence the capture path actually produces.
>
> **The "bundle phase B" rule below is what made it affordable, and it was followed literally.** §18
> (`dedupeKey` stripping one container prefix) and §19 (an accompanying defect's probe never reaching the
> capture) each needed a full recapture and neither was urgent. Each was written, measured, and
> DELIBERATELY NOT SHIPPED — §19 was even written and reverted in August — until one bump could carry
> both. That is the difference between two four-hour recaptures and one.
>
> **§17 opened a SCHEMA migration as well**, which is a different axis from the protocol: removing
> `landmark_present` changed the feature vector, so v15 weights cannot be scored by a v16 runtime.
> `scorer:migration` reports it and `release:gate` refuses while it is open; it closes when the same run
> trains and promotes a v16 candidate. Two invalidations, one run — the same bundling logic one layer up.
>
> **What re-opening cost, measured:** two dispatches refused before the run started, both correctly — a
> dirty lab checkout holding promoted weights, then an orphaned changeset. `run-job.yml` named the commit
> it would have run at each time. A job that pulled anyway would have captured ~2,900 pages at the wrong
> commit.
>
> Only **§12** remains, and it is not code: it closes when this branch merges to `main`.

| phase | items | why here |
|---|---|---|
| **A — tooling** | §1 progress files, §2 url audit, §3 typecheck, §4 CLI flags | touch no evidence and block nothing. Do them whenever; they make every later phase easier to watch and harder to get wrong |
| **B — capture path** | §5 DOM-side count, §6 cookie overlays and render readiness | these change what a capture CONTAINS. Anything captured before them may have to be captured again |
| **C — corpus** | §7 a real 2.4.4 page, §8 three subtypes' fifth case, re-add the page from §5 | authored against a settled capture path, so the cases are captured once |
| **D — model** | §9 retrain and re-promote, §10 publish | consumes A–C. Last, by definition |

### Two things that decide the real cost

**Bundle phase B.** Both items may bump `CAPTURE_PROTOCOL_VERSION`, and that invalidates every cached
capture — 2,122 of them, about four hours of fleet time. Doing them together pays that once. CLAUDE.md's
own rule: *"the cheap moment to pay it is bundled with any other pending bump"*. Run `npm run
evidence:check` on each change first — exit 0 means the change is evidence-neutral and the cache survives,
and neither of these is obviously one or the other.

**Prove each corpus change on ONE subtype before paying for the whole corpus.** `npm run lab:pipeline --
--pipeline=verify --only=<ids>` captures just those cases and runs the audits that would see the change.
A full recapture to discover a fix did not move the number is the wrong order, and this exists to stop it.

**Phase A can run alongside anything.** It is the only phase with no evidence dependency, so it is also
the right thing to do while a capture is in flight.

---

---

# Phase A — tooling: touches no evidence, blocks nothing, do it anytime

## 1. ~~Three long jobs still report no progress~~ — MOSTLY NOT A GAP, and the real one is fixed

**Corrected 2026-08-27 by measuring it.** The entry said `export`, `build-realism` and
`calibrate-abstention` should get `beginRun()` because `lab:status` had nothing to read for them. Timed
against real runs:

| job | actual duration |
|---|---|
| `build-realism` | **2 s** |
| `export` | **13 s** |
| `acceptance` | **25 s** |

A progress file for a two-second job is pure cost. The premise — "long jobs" — was wrong, and it came
from a plan written before any of them had been timed.

**The real defect was `lab:status` itself, and it was bigger than these three.** It read `DATASET_ROOT`,
which defaults to the training corpus, so a job that does not capture at all printed the DATASET run's
`captured: 29, total: 1431` under its own name — for **31 of 36 jobs**. Two earlier fixes each covered
the case somebody had just hit. Fixed at the root: the five jobs that capture declare `progress:` beside
their command, and everything else says *"this job does not report progress"* and points at `lab:log`.

**What is genuinely left**, and it is small: `train` runs about seven minutes and prints to stdout only,
so `lab:status` can say it is running but not how far. `lab:log` shows its output. Worth a progress file
only if a longer training run ever makes the difference between watching and waiting.

## 2. ~~The real-page corpus rots, and nothing watches it~~ — DONE

`npm run corpus:urls` follows every corpus URL and reports what moved. Written 2026-08-27; it found five
more the same day, on top of the seven found by a capture refusing them:

| was | now |
|---|---|
| `financial-ombudsman.org.uk/decisions-case-studies/…` | `/businesses/resolving-complaint/…` |
| `www.sepa.org.uk/environment/water/bathing-waters/` | `bathingwaters.sepa.org.uk/` — new HOST |
| `www.bl.uk/whats-on/` | `events.bl.uk/` — new HOST |
| `www.metoffice.gov.uk/weather/forecast/…` | `weather.metoffice.gov.uk/forecast/…` — new HOST |
| `sheffield.ac.uk/postgraduate/taught/courses` | `/courses/2026` — **rots every year** |

It **reports and never edits**. A redirect means one of three things and only a human can tell them
apart: the same page at a new address, the page gone with the site offering its parent, or a consent
interstitial. Auto-rewriting would make the third a silent corpus change.

Three things it does deliberately, each of which was a decision:

- **A script, not a test.** 92 third-party requests would be slow and flaky in CI, and a test that fails
  for the wrong reason gets deleted.
- **It reuses `addressesSamePage`**, so it cannot report a move the capture would tolerate, or miss one
  the capture would refuse.
- **UNREACHABLE does not fail it.** A third-party outage says nothing about the corpus, and a check that
  goes red for somebody else's downtime is one people learn to ignore.

**Sheffield is the interesting one and is left as a known annual break.** The unversioned path redirects
to the current intake, so an unversioned URL fails EVERY capture while a versioned one fails once a year
and this audit names it. Recorded in the entry.

## 3. `.mjs` typechecking — MOVED to [`not-working.md` §5](./not-working.md)

This entry said **46 of 102** while the tracker said **51 of 105**, and both were written by me on the same
day. One fact in two places, drifted — which is this repo's most-named defect, committed inside the
document that records it.

The remedy is the one it always is: delete the copy. §5 carries the count, the measured breakdown of the
remainder (1,796 errors, 76% of them unannotated parameters and bindings that are not independent), and
the order to take the files in. `typecheck-coverage.test.ts` holds the floor, which is the only number
that cannot drift because it is executable.

## 4. ~~18 CLIs still ignore an unrecognised flag~~ — DONE

**All 45 argv-reading `.mjs` modules now refuse a flag they do not know**, name the near miss, and print
what the command does take. The exemption list is empty, and `cli-flags.test.ts` DISCOVERS every
argv-reading module and requires each to be guarded or exempted with a reason — so a new one cannot join
silently.

An ignored flag runs the default and reports success, which this repo paid for twice: a blocker naming
`--write-baseline` when the flag is `--update-baseline`, and `--only=route-title-stale` covering 1 of that
family's 7 cases.

**The lists were READ out of each file, never derived, and every batch proved why:** `stability-gate`
builds flags from a variable and `repeat-capture` reads seven through an `arg(name)` helper, so a regex
reports ZERO for both; `fleet-playbook`, `capture-fixtures` and `audit-size-sensitivity` mention flags
they pass ONWARD to git or to Python; `compare-layers` takes its input positionally; `compare-workers`
accepts `--runs=` as a deliberate alias of `--rounds=`. A derived guard would have refused correct usage
in every one of those cases.

### Two things this uncovered

**`verify-safetensors.mjs` was invoked by nothing.** Not an npm script, not a playbook, not another
module. It checks the shipped model directory for weight formats that execute on load — `.pt`, `.pkl`,
`.ckpt` — and for symbolic links that leave the directory. A security check on the one artefact this
project publishes, which had never run. It is `npm run scorer:verify` now and the FIRST stage of
`release:gate`, so an unsafe artefact stops a release before anything expensive measures it.

**It also ran on import**, so `node -e "import(...)"` — the only way to catch a bad `.mjs` import, since
neither lint nor tsc can see one — executed the whole check. `entry-points.test.ts` explains exactly why
that matters and did not cover this file, because its discovery reads npm scripts and nothing invoked
this one. Guarded, and split into named functions on the way past.

# Phase B — capture path: changes what a capture CONTAINS. Bundle these

## 5. One page is out of the corpus and nobody can say why it failed — DONE, and the answer is NOT US

Answered on the first clean capture after the flag-guard fix:

```
weather.metoffice.gov.uk/warnings-and-advice/uk-warnings
census heading=0  link=5   graphic=4    |  27 announcement(s)
DOM    heading=55 link=281 graphic=31
   <- 55 headings in the DOM, 0 in the tree: the page EXPOSES nothing,
      which is a finding about it, not about this tool
```

**The page rendered in full and exposed none of it.** That is a real 1.1.1 and 1.3.1 finding on a page
whose publisher declares it conformant, and it stands. The instrument discriminates rather than always
saying the same thing — `cqc.org.uk/search` on the same run reads `census heading=41 | DOM heading=54`,
which is the healthy ratio.

**And the report was contradicting itself about it.** `furnitureCaptures` classifies on the TREE alone, so
a zero-heading capture was filed as an "unrendered SHELL" under a headline reading *"anything they say is
about this tool"* — printed directly above `noteEvidence`'s line saying the opposite. The DOM count had
been computed and displayed and never reached the code that CLASSIFIES: a remedy reaching one consumer and
not the deciding one, this repo's most expensive recurring shape, committed inside the report written to
expose it. Now: **0 furniture claims across 81 real pages**, down from 1, and the page appears only as the
findings it earns.

An uncounted DOM stays furniture, deliberately. An older capture with no DOM census cannot demonstrate the
page rendered, and claiming a finding on evidence we do not have is the one error this report must not make.

**A diagnostic trap that nearly discarded a correct result.** The lab journals in UTC and the playbook
prints its own timestamps in BST, so a verdict produced at 10:30 is stamped `09:30:08` — which reads
exactly like the stale-journal defect this file records three times. It was the same moment in two zones.
Settle it with the InvocationID the playbook already reports, not by comparing clocks.

## 6. Two capture-path behaviours — DONE: one MEASURED AS NOT HAPPENING, one proven neutral

### Cookie/consent overlays — detected, and never once blocking

The entry said a page whose content sits behind a modal would be captured as the modal. **Measured across
85 conformant real pages: it has never happened.** Every UK public-sector site opens with a cookie banner
and the read-through walks straight past it — networkrail opens on Cookiebot and still reaches 69
announcements and 11 headings.

The first version of that measurement said **50 of 86**, because it merged "has a banner" with "never got
past one". The accessibility tree is the discriminator: a capture that reached the page has HEADINGS in
its census. Corrected, the count is **0**.

So the honest state is: **detected, reported, and not occurring.** `rules:real-pages` names any capture
that opened on an overlay and never reached a heading — and now does so on a PASS as well as a failure,
because a bad capture that matches an equally bad baseline entry reads as stability rather than as the
defect it is.

**Nothing dismisses a banner, and that stays deliberate.** Clicking "accept all" on somebody's site is a
consent decision this tool has no business making on their behalf, and the read-through does not need it.
If a page ever IS blocked, the detector says so by name and the decision can be made about that page.

### Render readiness — fixed and PROVEN

`waitForPageToSettle` waits for the accessibility tree to stop changing rather than for a duration.
Deliberately not "wait for content": that would hang the full budget on a page which genuinely has none,
which is exactly what `1.3.1:no-headings` exists to catch.

It costs nothing where nothing was wrong — a server-rendered page is already settled and it returns after
one 400 ms poll — and a page that never settles is captured as it stands and marked, because refusing it
would reject evidence rather than describe it.

**It did not fix the Met Office page**, which is what proved settling is necessary and not sufficient, and
what §5's DOM count is for.

**DONE.** `npm run worker:code` reports all five workers at `56a39c9a18aeb5c6`, matching this checkout,
so the fleet runs both changes; `evidence:check` reported **48 compared, 48 same, 0 drift, 0 changed**.
Both are evidence-neutral and the 2,122 cached captures survive.

The prediction in the paragraph above was right, and running it was still the point: predictions about
evidence are not evidence. §5's verdict is what the settle wait plus the DOM count were for, and it came
back on the first clean run.

# Phase C — corpus: authored against a settled capture path

## 22. CLOSED 2026-09-02 — `3.3.3` ships as a RULE. The head could not learn it; it did not need to

The first WCAG criterion this project has added since the corpus was built, and the useful part of the
story is the instrument rather than the criterion.

**The head failed, measurably, and that was the right measurement to stop trusting rather than the right
place to stop.** 16 training families / 34 cases, 5 held-out cases, and:

| | document-mean | instance-max |
|---|---|---|
| train recall (15 positives) | **0.0** | **0.0** |
| test recall (16 positives) | 0.0 | 0.0 |
| false positives on conformant | 3 | 2 |
| held-out scores vs cut | 0.758–0.893 vs 0.967 | 0.730–0.938 vs **0.983** |

Recall 0.0 on its own TRAINING data. Pooling was a good hypothesis — `INSTANCE_POOLED_SUBTYPES` says
pooling is a property of the signal, and 3.3.3 is one clause inside a long announcement, which an average
dilutes — and it measured no better. **Do not re-run that experiment.**

**It never needed a head.** Whether the announced error carries an INSTRUCTION is READ from the
announcement, which is this project's own test for what a rule may assert, and the same basis on which
`1.1.1:filename-alt` is rules-owned. The deterministic signal discriminated 44 captured pairs while the
head could not fit 15. `a11y-witness:error-announced-without-remedy` is now the THIRD rule permitted to
claim `conformance` — a list pinned by a test so that promoting an inference to an assertion is a visible
edit. Measured on 2,170 captures: fires on every positive, **0 false positives**.

**What it cost to wire in, which is the reusable part.** Seven registries had to agree, and every one
refused until it did: `rule-ownership.json`, `ABSENCE_CRITERIA` (or the model's weaker finding survives
and suppresses the rule's), `RULE_CRITERIA` (the coverage audit cannot ask about a criterion it does not
know exists), `ACT_RULES`, the pinned conformance list, `NOT_SWEEP_DERIVED`, and the stranger-facing
totals in `action.yml` and `RELEASE.md`. Plus `MODEL_EXCLUDED_SUBTYPES`, without which the failing head
is trained anyway and fails the acceptance gate for ever.

**The public claim is narrower than the count, deliberately.** Fifteen criteria can now produce a finding
and the number that matters on a real page is still ELEVEN. 3.3.3 reads the form probe, which is off for
pages we do not own — see §21 for the same constraint on 4.1.3 — so on somebody else's site it cannot fire
in either direction. Adding it to the "always run" list would have been the easy edit and a false one.

**Still true, and the reason 3.2.1 and 3.2.2 are not here:** those two need a probe that does not exist,
which is a `CAPTURE_PROTOCOL_VERSION` bump and a full recapture. 3.3.3 was the one of the three reachable
screen-reader criteria that cost no capture change, which is why it was taken first.

## 23. CLOSED 2026-09-02 — `3.2.1` and `3.2.2` ship. The bump was paid and the fleet took ~8 h

The last two screen-reader-reachable criteria this tool does not assess. Recorded properly rather than
carried as a verbal caveat, because "we could do it" and "here is what it costs" are different statements
and only the second is useful.

| | |
|---|---|
| **3.2.1 On Focus** | focusing a control causes a change of context — the page navigates, a window opens, focus jumps |
| **3.2.2 On Input** | the same, on changing a control's VALUE rather than focusing it |

**Most of the machinery exists.** `probeTypedFeedback` already lands on an edit field, types
`TYPED_PROBE_TEXT` and captures the speech delta — 3.2.2 is that plus a context check.
`probeRouteChange` already records the page title before and after an activation, which is what a context
check reads. `probeFocusOrder` already walks the tab order for 3.2.1's half. `criterion-coverage.ts` has
said so for months: *"a probe this tool has the machinery for but does not drive."*

**What it costs is not the code.** Either probe writes a new channel, and `recordWhatWasAsked` gives every
capture an `observed.<channel>` entry — so the field appears on new captures and is `undefined` on old
ones. That is exactly the split-corpus failure the protocol-10 note describes: *"a consumer reading
`observed.links?.asked` gets a fact on some records and `undefined` on others, and `undefined` is the
ambiguity this whole field removes."* So it is a `CAPTURE_PROTOCOL_VERSION` bump, 13 → 14:

```
2,677 cached captures invalidated
~8 h across the five-box fleet to recapture (MEASURED on the protocol-14 run: 3,188
captures at 3.1 cases/min, 9.4 s each, 0 failures — not the ~4.5 h this entry first said, which I took
from `reliability-plan.md` where it contradicted the 7 h 22 m it cited in the same sentence)
```

**And it must be BUNDLED, which is the real reason this is a decision rather than a task.** CLAUDE.md's
own rule: do a bump deliberately, "ideally alongside a recapture that was happening anyway". Protocol 11
bundled three additions for exactly this reason and says so — *"each of the three is individually too
small to justify ~8 h of fleet time; three together are not, and taking them separately would have cost
that time three times over."* Two criteria are a reasonable bundle. One, taken alone because a list wanted
shortening, is the economy that rule warns against.

**Why it was not half-built while waiting.** Landing the probes without paying for the bump gives capture
code no case exercises and no signal reads — "written, embedded and inert", which this file names as the
most expensive shape here. §22 is the same judgement made hours earlier and at real cost: the 3.3.3 head
was measured, refuted and REVERTED rather than shelved behind an exclusion, for precisely this reason.
Building 3.2.1's probe and leaving it dark would contradict that within a day.

**What would tell you it is fixed:** `criterion-coverage.ts` reads `assessed` for both — which
`criterion-coverage.test.ts` permits only once the judge can actually return those findings — and
`everything` completes with them scored.

**CLOSED.** Both criteria are `assessed`, decided by RULES, and score `28/28 rules: EXACT` with zero
false positives. The corpus reads `1594 discriminating, 0 blind, 0 contaminated, 0 uncaptured, 0 stale`,
and `everything` completed all nine stages with FITNESS: PASS. The tool now has **17 criteria able to
produce a finding**, up from 15.

The bump cost what this entry said it would once the estimate was corrected: ~8 h across five boxes, and
a stalled worker added three and a half more (§24, and `fleet:recover` came out of it).

What the gates extracted on the way, none of it optional: four separate wiring bugs in the focus probe —
Tab landing on the skip link, the flag dropped from `observed`, the probe running AFTER the tab walk that
destroyed its own precondition, and the result never reaching `interaction`; a veto classification that
would otherwise have put uncompletable corpus work on a list; three parallel field lists that would have
compared an OBJECT by count; and an overclaim where declaring both criteria undemonstrable on real pages
was the easy edit and false about 3.2.1.

That last one is the part worth keeping. The two are the same shape and land on OPPOSITE sides of the
consent line: `probeFocusContext` presses Tab, which `probeFocus` already pressed on every real-page
capture, so 3.2.1 is now exercised on 39 pages it did not write and stays silent on all of them —
correct, on conformant pages. `probeTyping` enters characters into a stranger's field, so 3.2.2 genuinely
cannot be asked there. Each declares its own reason.

**PROVED ON A REAL CAPTURE, 2026-09-02, so the decision rests on evidence and not an estimate.**
`probeTypedFeedback` now reads the page title either side of the keystrokes, and one pair captured through
real NVDA answers whether the machinery can see the failure at all:

```
good   titleBefore "Archive search"   titleAfter "Archive search"
bad    titleBefore "Archive search"   titleAfter "Results for 123456"
```

That is 3.2.2's failure, observed. It shipped WITHOUT a bump and safely: no corpus case uses
`probeTyping`, so no cached capture carries `typedFeedback` and there is nothing to split. What remains
for 3.2.2 is a corpus family, a rule and the eight registries — mechanical, and none of it needs fleet
time until the end. 3.2.1 is the same shape against `probeFocusOrder`'s tab walk and is not yet written.

**The decision, stated once so it can be answered:** bump to 14, bundle both criteria, and spend one
recapture. Nothing else is in the way — not the design, not the corpus, and not the code; the feasibility
question that would normally justify hesitating is now answered.

**Why the bump stays LAST rather than first.** A half-finished bump is the worst state available: the
corpus is invalidated and the criteria are not delivered, so the cost is paid and nothing is bought.
Everything above it can be built and verified without touching a cached capture, which is why it was.

## 24. CLOSED 2026-09-02 — two writers on one file, and the fix is VERIFIED on the fleet

`CLAUDE.md` tells you what to do when a worker misbehaves: *"`server.log` persists on the guest. You cannot
pull it while the worker is down, so read it after it recovers — the record of the death is still there."*

Measured 2026-09-02, on all five boxes: it is not there.

A 40-line tail from a11y-worker-2 spans ten worker restarts across two days and contains only three kinds
of line — the `ForegroundLockTimeout` script's output, `[run-server] starting <node>`, and node's
`DEP0190` warning. Every one is written by the LAUNCHER or by stderr redirection. Not one line comes from
the worker's own `log()`, although that function demonstrably works: `warming up NVDA`,
`warm: NVDA is up and answering`, and `desktop is blocked by 1 dialog(s)` all appear on the worker's
CONSOLE, captured in `action-smoke` output the same day.

**What it cost.** A capture on a11y-worker-6 ran from 03:00 to 06:32 holding `busy`, and the corpus
recapture made no progress for three and a half hours. Both bounded timeouts that should have ended it —
the worker's 520 s hard timeout and the host's 600 s `waitForWorker` — did not, and the log that would say
which of them failed contains nothing from the period. The fault is still undiagnosed for that reason
alone.

**The leading hypothesis, stated as one.** `run-server.cmd` redirects stderr into `server.log` and holds
that handle for the worker's whole lifetime. `createLogWriter` appends to the same path from inside node,
and on Windows a second writer can be refused. Its write is wrapped — *"the console is the file's
fallback"* — so a refusal is invisible by design, which is exactly the shape that lets this persist. Its
`rotate()` renames the file, which a held handle also blocks, and that failure is likewise console-only.

Not proven: it needs a Windows worker to confirm, and `server-log.mjs` is testable with an injected `io`,
so a test can be written against the real writer without one.

**CLOSED, and the hypothesis was right.** `run-server.cmd` holds `server.log` open for stderr redirection
for node's whole lifetime while `createLogWriter` appended to the same path — two writers, one file, on
Windows, with the refusal swallowed because "the console is the file's fallback". The worker now owns
`worker.log` and the launcher keeps `server.log`; `/diagnostics` returns both tails.

VERIFIED on a11y-worker-2 after deploy, which is the part that matters — the fix was committed before it
could be tested and a hypothesis held until then:

```
[2026-09-02T15:43:12.315Z] capture .../input-context-change-archive/good.html (nav=object, probeForms...
  -> 3 phrases; afterStart.lastSpoken="heading, level 1, Archive search"
```

40 lines of genuine worker output where there were none. A hung capture now leaves a record.

**What told me it was fixed:** `/diagnostics.serverLogTail` on any worker shows a line the worker
itself emitted — a warm-up, a fault, a recovery — rather than only launcher output.

**Worth noting how close this came to staying invisible.** `serverLogTail` exists precisely for this
question, and its own comment says why the size summary beside it is not enough: *"`serverLog` already
reported the file's SIZE, which answers 'is it growing' and not 'what does it say' — and the second
question is the one you have when something did not happen."* I read the size field first, concluded the
fleet had no logs at all, and was wrong. The right field was already there and already argued for.

## 21. `4.1.3` real-page grounding — UNBLOCKED 2026-09-03, and demonstrated on a real pair — STILL OPEN, and this is CORRECTED from an earlier version of this audit

**CORRECTED 2026-09-05.** An earlier pass of this same audit cross-linked this section to [§29](./known-gaps.md)
on the claim that `N > 0`, the "done when" line this section states below. That was wrong: `4.1.3: 0 of 37`
is confirmed as the number after the capture §29 describes, for two reasons that have nothing to do with
whether a capture ran — the one configured page is `role: "calibration"` and `build-realism-tier.mjs`
excludes calibration pages from the count by construction, and the count's other masking (`routeChange.announced`
on the first-link-is-usually-a-skip-link problem, described below) is untouched regardless. §29 has the
full correction. **This section's own closing condition does NOT hold**, and this row was wrong to say it
did. What §29's capture DID prove — real 4.1.3/3.3.1 grounding as a CALIBRATION measurement, outside the
realism-tier count entirely — is a genuine, separate result, described there.

**Not a defect. Measured, understood, and deliberately open** — recorded here rather than left on a
to-do list, because the thing standing in the way is a decision about other people's websites, not work.

`build-realism` reports `4.1.3: 0 of 37` — every real page masked for that head, the only one with no
real-page evidence at all. Two probe-gated criteria are in the same position and 1.4.2 is a third:

```
1.4.2, 3.3.1, 4.1.3   assessed on the corpus, 0 of 77 real captures carry the evidence
```

**Why it is masked is correct.** Those heads read `formChanges` / `postSubmitFields`, and `probeForms` is
OFF for every real-page capture: submitting a form on a site we do not own is not a review — the same line
`SECURITY.md` draws and the CLI follows. Unmasked, 41 pages would train 3.3.1 as clean and 39 would train
4.1.3 as clean from evidence that was structurally absent, which is a label asserting something the
capture cannot show.

**Why the obvious fix is also wrong**, and this is the part worth not re-deriving. 4.1.3 gained a SECOND
channel on 2026-09-01: `routeChange.announced`, from `probeNavigation`, which real captures DO run. So the
map looks like it names one of two channels. But `probeNavigation` follows the FIRST link, and
`capture-real-pages` states what that is — *"on essentially every real page the first link IS the skip
link"*. A skip link is not a status-message trigger, so "pressed, and nothing was announced" is CORRECT
behaviour there. Labelling it 4.1.3 would teach the head that silence after any link is a failure, on 37
pages at once, all agreeing and all wrong. The refutation is recorded in `build-realism-tier.mjs` beside
the map, where somebody proposing the change will be standing.

**What would actually close it, and the cost.** A real page whose activated link is known to be a FILTER
rather than a skip link — a fact about the page, so it belongs in `real-page-corpus.mjs` beside
`claimExcludes`, plus the ability to tell `probeNavigation` WHICH link to press.

That second half is why this is not queued as ordinary work. Today the tool presses the first link and
calls it ordinary browsing; pressing a link WE choose on a stranger's site is a different promise, and it
is the same argument `probeForms` already lost. It is not obviously wrong — following a named in-page
filter is still browsing — but it widens what this tool does to sites nobody asked, and that belongs to
whoever owns `SECURITY.md`, not to whoever is closing a coverage number.

**What would tell you it is fixed:** `build-realism` reports `4.1.3: N of 37` with N > 0, and
`rules:real-pages` shows no new findings on the 86 conformant pages.


## 7. `2.4.4`'s rule has never fired on a real page — DONE, and the gap was the COUNT

**This entry was wrong in both halves, and an audit rather than an argument is what showed it.** It said
the rule had never been validated on real evidence and prescribed "a real page that exhibits it, not a
change to the rule". Neither was needed:

- The corpus already held such a page. `nvda-w3c-bad-before.json` is a real capture of
  `w3.org/WAI/demos/bad/before/home.html`, carrying two links both announced `"Click here, link"` in one
  paragraph — WCAG F63, and the exact shape the rule's message describes.
- The rule already fired on it. Verified offline in milliseconds, before anything was changed.

What was missing was the population. `rules:coverage` defined "real" as one directory,
`runs/real-page-corpus`, so the eval fixtures — captures of live websites, held out for judge quality —
could not be seen. **It reported an untested assumption that had been tested all along**, which is worse
than reporting nothing: it sent the next reader to find a page that was already there.

Fixed by counting every population that holds real evidence, keyed on the CAPTURE'S OWN URL rather than
on the directory — `fixtures/tutorials` and `fixtures/books` sit beside the real ones and are authored
pages and `file:///` captures, so a directory rule would have counted them and a scheme rule would have
admitted the two served from the lab's page server. Mutation-checked: removing the source reproduces the
old report exactly.

```
  2.4.4  assessed  38  0  never on a REAL page — assumptions untested      <- before
  2.4.4  assessed  38  1  validated on real evidence                       <- after
```

`1.1.1` 19 -> 29, `3.3.2` and `4.1.2` 3 -> 6 on the same change, and the unvalidated list 7 -> 6. No
criterion regressed. Pinned by `rule-coverage-populations.test.ts`, which asserts both the claim and the
discriminator, because those rot independently.

**The general lesson, which is this repo's most-repeated defect one layer further out.** "The rule never
fired" and "the rule never had its evidence" were already recorded as different answers. This is a third:
**the rule fired where nobody counted.** Before trusting any coverage number, ask what population it was
computed over — and make the number say so.

One thing checked and deliberately NOT done: `"Read more..."` on `before/template.html` looked like a
second real-page candidate and is not one. It sits in a table cell with its own intro text, so it has
programmatically determined context and is 2.4.9's question (AAA, unreported here) rather than 2.4.4's.
Adding it to `VAGUE_LINK_NAMES` would repeat 2026-08-24's most expensive mistake, where a feature
answering a different criterion's question cost 27 false positives.

## 8. Three subtypes have fewer cases than furniture buckets — DONE

`focus-trapped`, `focus-order-scrambled` and `control-unreachable-by-keyboard` had **4 cases each** against
**5** layout buckets, so each missed one furniture shape by construction — a feature constant at zero
across every positive of the subtype, which ADR 0015 calls a free veto.

A fifth case each, and **each is a different MECHANISM rather than a restatement**. Each subtype had one
mechanism and three multi-defect variants of it, so the head had seen one way of failing four times.
Each new case was also chosen so a STATIC checker handles it differently from its sibling, which is the
standing question this project exists to answer:

| subtype | the existing mechanism | the added one |
|---|---|---|
| 2.1.2 | a keydown handler cancels Tab — traps the keys it names and nothing else | a `focusin` guard on the container, which holds against Tab, Shift+Tab, arrows, a click and a programmatic focus alike. No `tabindex`, no key handler: the markup is conformant on its face |
| 2.4.3 | positive `tabindex`, which every checker flags as a smell | a scripted tab-advance with **no `tabindex` anywhere** — the pattern real forms grow when somebody makes tabbing "smarter" |
| 2.1.1 | `div role="button"` with no `tabindex` — the shape every static rule looks for | a NATIVE `<button tabindex="-1">`, which a checker scanning for "interactive element without a tabindex" passes without comment. Same announcement, same failure, invisible to markup analysis |

Measured cost rather than predicted: **+11 cases** (3 base, 8 auto-generated multi-defect and conformant
variants) and **9 existing pages re-bucketed** — contained to those three subtypes, which is the documented
trade for dealing furniture within a subtype instead of hashing it independently. Those 18 captures
recapture on the next corpus run.

`furniture-spread.test.ts` passes per feature, which is what made the gap visible rather than a matter of
somebody remembering.

## 9. The model is one corpus revision behind — DONE

| | |
|---|---|
| **was** | shipped model trained on 2,403 records; the corpus exported 2,426 |
| **now** | **2,448 exported, 2,485 trained** (base + realism tier), `grade: "release"`, promoted |
| **done when** | `training-report.json`'s `dataset.records` matches the export — it does |

The corpus change was proven on one subtype first (`--pipeline=verify --only=`), which caught a case that
could never have fired and cost minutes instead of a four-hour recapture. See §8.

### What the chain surfaced on the way, all of it ordering and reporting

Every one of these was a guard that could not report itself, and none was a product defect:

| | |
|---|---|
| the `real-pages` pipeline captured **39 of 89** pages | `capture-real-pages` DEFAULTS to `--role=training`, so the pipeline scored and rewrote the baseline against whatever was on disk. A stage can now declare its vars, and both roles are named |
| `--update` rewrote the baseline from partial coverage | it now refuses, naming every page it would erase — and distinguishes a RENAMED url (drop it, the record moved) from an uncaptured one (refuse) |
| `corpus:urls` counted a page it never saw | a 403 returns the URL asked for, so `addressesSamePage` said "same page". A non-OK status is a third answer: `89 checked (88 actually seen), 1 blocked` |
| `lab:reset` discarded a file and said "Nothing was deleted" | and `-e remove=` could never work on more than one file, because the porcelain was split inside a FOLDED scalar. `promote` writes three |
| **the corpus audits ran AFTER `promote`** | `grants-audit` refused over one record with the weights already in the shipped directory. A gate that arrives after the act is a report |

### The one real limitation, and it is structural rather than a defect

**STALE — verified against the tracked baseline 2026-09-05, and the table below is superseded.**
`packages/lab/scripts/scorer-shortcuts.baseline.json` (committed at `3ffd775`) no longer lists
`form_field_unnamed` as a veto on ANY of the three focus subtypes — the FOCUS_SAFE remedy described two
paragraphs below this table did close it, which answers the question this section's own "what is NOT
established" paragraph left open. Positives also moved with the corpus (8/8/7 → 24/19/10). Current state,
read from the same baseline: all three subtypes carry zero closable vetoes, and every veto that remains is
classified `perturbs-measurement` (`validation_error_announced`, `status_update_announced`,
`validation_error_missing`, `form_change_observed_absent`, `state_changed`, and the `form_change_*` /
`post_submit_present` family) — structural, not a free veto ADR 0015 names. The table below is kept as the
historical measurement that motivated the FOCUS_SAFE fix, not as a description of HEAD.

```
2.1.1:control-unreachable-by-keyboard   8 positives  10 vetoes  form_field_unnamed (-4.60)   <- HISTORICAL, see above
2.1.2:focus-trapped                     8            10         form_field_unnamed (-6.59)   <- HISTORICAL, see above
2.4.3:focus-order-scrambled             7            10         form_field_unnamed (-6.59)   <- HISTORICAL, see above
1.3.1:no-headings                      29             5         heading_present   (-2.93)
```

**`1.3.1:no-headings` cannot be fixed and never needs to be**: every positive of that subtype has zero
headings by definition, and the subtype is `decidedBy: "rules"`, so the veto cannot reach a user.

**The focus ones have a real cost and no remedy available today.** `bare-edit` is the only accompanying
defect granting an unnamed field, and `PERTURBS_FOCUS_ORDER` excludes it from all four focus-order
criteria — an `<input>` injected into the BAD variant only enters the tab order and perturbs the very
channel those cases are measured on. That exclusion is correct and was learned by producing the corpus's
only BLIND case in 1,306. So the feature cannot appear on a focus positive without either corrupting the
evidence or making the conformant variant non-conformant.

The cost is the ADR 0015 shape pointed the other way: the 2.1.1 head is pushed down 4.6 logits on any
page that has an unnamed form field, and real pages frequently do.

**~~A candidate remedy, untested~~ — BUILT 2026-08-28 in `2a2734d`, and this paragraph was stale.** An
`<input tabindex="-1">` with no label is an unnamed form field in the accessibility tree and never enters
the tab order, so a focus-safe variant supplies the feature without perturbing the channel.
`case-matrix.mjs` carries `FOCUS_SAFE = { "bare-edit": "bare-edit-inert", "vague-link": "vague-link-inert" }`
and substitutes inside the filter rather than enlarging `ROTATIONS` — which would have re-rolled every
multi-defect pairing, since the choice is `(rotation + round) % ROTATIONS.length`.

`vague-link` was included too, and the reason it had been excluded was CHECKED rather than accepted: both
`controlUnreachableByKeyboard` and `focusOrderIsScrambled` compare `structure.formFields` against
`interaction.focusOrder` and neither reads `structure.links`, so an inert anchor enters neither channel.

**~~What is NOT established is whether it WORKED~~ — ESTABLISHED, 2026-09-05: it worked.** This paragraph
described a laptop that could not run `scorer:shortcuts` and therefore could not tell. The question does
not need re-running the audit, only reading its committed OUTPUT: `scorer-shortcuts.baseline.json`
(`3ffd775`) is the record of exactly the `lab:job -e job=shortcuts` run this paragraph asked for, and
`form_field_unnamed` is absent from all three focus subtypes in it — see the corrected table above. Kept
rather than deleted because a laptop's own refusal (`"1868 of 1868 record(s) carry no parsed block"`) is
itself a real, re-occurring shape worth the reader recognising on sight.

Recorded in the shortcuts baseline rather than left refusing, because that baseline exists to detect
REGRESSIONS after a deliberate corpus change and these were diagnosed rather than assumed — and the
baseline itself is now the answer, not just the record of having asked.

## 10. Publishing — MOVED to [`not-working.md` §8](./not-working.md)

Same reason as §3: a changeset count restated here goes stale the moment one is added, and one was. §8
carries the live state and the reason the last step is a human's.

## 11. ~~The announcement grammar cannot read a LANDMARK~~ — WRONG CAUSE. Fixed, and it was mine

**Recorded and then corrected the same afternoon, which is the useful part.** The entry claimed
`announcement.ts` could not read a landmark, citing 100 of 267 real announcements yielding no name, and
argued the fix needed NVDA's announcement forms established from source rather than pattern-matched.

**The grammar was right the whole time.** It parses every one of those correctly:

```
"complementary landmark, Related WCAG resources"   containers[0] = {name: "",             role: "complementary landmark"}
"Page Contents, navigation landmark, Page Contents" containers[0] = {name: "Page Contents", role: "navigation landmark"}
"form, Explore Site by Topic:"                      containers[0] = {name: "",             role: "form"}
```

A landmark is CONTEXT, not the object — `announcement.ts` says so at line 15, because reading one as the
object's role *"reported three conformant W3C pages as 4.1.2 failures"*. So `objects[0]` is correctly
`undefined`, and `sweepCompleteness` was reading `objects` for every type. **Asking the object channel a
container's question**, which is the same defect `capture-integrity-plan` is about, committed inside the
fix for it — and then written up as somebody else's bug.

Three things had to be right, and each was established by measuring the corpus rather than reasoning:

| | |
|---|---|
| the name lives in `containers`, per type | 267 -> 232 entries resolve to a landmark |
| an UNNAMED landmark still counts | 121 of 262 are unnamed, and the census counts them per element — dropping them would read a page of unnamed landmarks as truncated |
| **every** container, not just the first | 5% of entries carry more than one, because NVDA announces the containers it passed through on the way in |

Measured after: a real W3C capture went from `landmark: unknown` to **`landmark: exact`**, with all five
types now exact on that page.

**The residual is 35 of 267 and is NOT a parse failure.** Those entries contain no landmark at all — `"Get
Involved, link"`, `"Overview, heading, level 2"` — the landmark sweep announcing something that is not a
landmark. They contribute nothing, which is right: counting them would inflate the total into a phantom.
When an ENTIRE page resolves to none, the verdict is `unknown` rather than `truncated`, because "the page
has no landmarks" and "our extraction failed" are indistinguishable from there.

**The lesson, and it is why this entry is kept rather than deleted.** The original diagnosis was reached by
running one function, seeing `undefined`, and blaming the function. Nothing was measured before it was
written down. The 2026-08-24 rule it invoked — *establish the forms, do not pattern-match* — was the right
rule cited to justify not looking.

## 12. STALE 2026-09-02 — CI on `main` is GREEN and has been for many pushes

Checked rather than assumed: `lint.yml` reports `success` on `ff13fe4` and `2aaedc1`, the two most recent
pushes to `main`. The entry below described `origin/main` at `7dd7fb9` with a guidepup import failure, and
that was true when written — dozens of merges ago. Left in place because the ANALYSIS of why a
screen-reader import throws on a Linux runner is still the reason `capture-regression.yml` is
path-filtered, and because an entry that says "this was the fault and here is why it no longer is" is
worth more than a deletion.

### The original entry, for the reasoning

Established 2026-08-29 while chasing why `action-smoke` was failing, which was a different fault (see
below). `origin/main` is at `7dd7fb9`, and `lint.yml` — which gates ESLint, `tsc` and the whole unit suite
— **failed on exactly that commit** and has not run since, because it triggers only on pushes to `main`
and on pull requests. Work on a branch never fires it.

The failure is `Error: No available supported screen readers`, thrown at IMPORT by guidepup on a Linux
runner. `packages/nvda-worker/src/diagnostics.test.ts` and `packages/cli/src/action/summary.test.ts`
imported the worker BY PACKAGE NAME, and the package index re-exports `capture-core.mjs`.

**It is already fixed**, in `94b0209` (2026-08-25), which switched both to relative imports and added
`no-win32-imports.test.ts` to keep them that way. That commit is on `v8-feature-schema` and not on `main`.

**Why it stayed invisible for a week, and this is the general lesson:** the throw is invisible on macOS,
because VoiceOver satisfies guidepup's "is a screen reader available" check. So the suite passes locally,
the pre-push hook passes, and the only environment that can see it is the one nobody watches — a branch
does not trigger `lint.yml`, and `main` has had no push since.

**Done when:** this branch merges and `lint.yml` reports success on `main`. Nothing else is required; do
not "fix" it again.

**THE ONLY GAP IN THIS FILE STILL OPEN, as of 2026-08-30**, and deliberately so: merging is a decision
about what ships, not a code change. The fix has been on `v8-feature-schema` since `94b0209`; the branch
is green locally (lint, `tsc`, the full unit suite) and every other entry here is closed. Note that the
branch now also carries `CAPTURE_PROTOCOL_VERSION 8` and an OPEN v15 -> v16 schema migration, so `main`
would inherit a state where `release:gate` refuses until a v16 candidate is promoted — which is the
migration working, not a problem, but it is worth knowing before merging rather than after.

### The separate fault found at the same time, which was mine

`action-smoke` was red on every commit today for an unrelated reason: `packages/control` was extracted
without refreshing `package-lock.json`, so `npm ci` — the first step of every workflow — refused with
`Missing: @a11y-witness/control@0.1.0 from lock file`. Fixed, with `lockfile-in-sync.test.ts` to close the
class offline.

**Correcting a claim in that commit's own message:** it says `lint.yml` "has been failing on every commit"
because of the lockfile. That is wrong — `lint.yml` had not run since 23 August and its failure is the
guidepup one above. Two red workflows, two unrelated causes, and I attributed both to the one I had just
found. Exactly the shape this repo's diagnostics table warns about: the first plausible cause, believed.

## 13. ~~The WORKER's cross-check compares entry counts against distinct names~~ — DONE

Found 2026-08-29 by validating the corpus run 90 minutes in rather than waiting for it, which is the only
reason it was caught before the whole run carried it.

`crossCheckStructure` runs on the worker, and the worker has no announcement grammar — it is plain node,
and `parseAnnouncement` is TypeScript. So it compares `structure.links.length`, an ENTRY COUNT, against
`census.distinct.link`, a count of distinct NAMES. Those are different quantities in both directions:

- two links sharing a name are two announcements and one name -> reported `phantom`
- one landmark entry can announce several landmarks, and some announce none -> reported `truncated`

Measured on 675 fresh protocol-7 captures, worker-side against host-side on the same evidence:

| | worker `structureCrossCheck` | host `sweepCompleteness` |
|---|---|---|
| agreement | **51%** | **47 of 60 captures exact on ALL FIVE types** |
| link | 191 `phantom` | **60/60 exact** |
| landmark | 139 `truncated` | 47/60 exact, 13 truncated — and those 13 are REAL |

The 13 are the documented caret rule: quick navigation cannot reach a landmark containing the caret, so a
page-wrapping `<main>` is missed. One checked directly — the tree exposes 1, the sweep announced `[]`. C1
is making a known limitation visible instead of silent, which is what it is for.

**This is the C3 fix reaching one call site and not the other, and I wrote both.** Same shape as
`anchorToTop`, `ensureSpeechChannel` and `refreshBrowseBuffer`.

**Already mitigated where it mattered:** `capture:explain` now reports the HOST verdict and prints the
worker's number as raw, labelled. No rule reads the cross-check, so nothing asserted on it.

**DONE 2026-08-29**, once the corpus run finished and deploying could no longer destroy unresumable work.

`crossCheckStructure` now records `sweepEntries` and `oracleDistinctNames` and renders no `kind`, and the
result is `sameCounts` / `differsOn` rather than `agrees` / `disagreements` — both old names read as
verdicts on the PAGE, when these two numbers differing is usually a fact about how they are counted.

`capture:explain` reads BOTH shapes, deliberately: it is pointed at captures of any age, and every capture
taken before this carries the old spelling. A reader that understood only the new names would make the
existing corpus unexplainable to fix a naming problem — and a pre-§13 capture's `kind` is still PRINTED,
labelled as a verdict the worker cannot compute, because it is what that capture actually recorded and a
reader comparing an old report with a new one needs to see why they differ.

**Still needs a deploy** for new captures to carry the new shape; nothing recaptures, and the old shape
keeps explaining until then.

## 14. ~~Owning a subtype and ASSERTING it are unconnected~~ — MOSTLY WRONG, and the code refuted me

**Written and then largely retracted the same evening, by reading two files further.** Kept because the
retraction is the useful part.

**What was real, and is fixed.** CLAUDE.md's headline table said `decidedBy: "rules"` means
"conformance-mapped, so `criterionOutcomes` reports `failed`". It does not: `rule-ownership.json` has no
`mapping` field, `add()` defaults to `secondary`, and only 4 of 16 call sites pass `"conformance"`. So
`1.3.1:no-headings`, `2.1.1`, `2.1.2`, `2.4.1`, `2.4.2`, `2.4.3` and `1.1.1:filename-alt` are rules-owned
and all report `cantTell`. Verified end to end. CLAUDE.md corrected.

**What was WRONG.** I wrote that the mapping "lives only at an `add()` call site … with no declaration
beside the ownership it appears to follow from", called it undiscoverable, and said the maintainer needed
to decide per subtype. All three are false:

- **It IS declared.** `act-rules.ts` states every mapping in the W3C's ACT Rules Format —
  `accessibilityRequirements: [{ criterion, mapping }]` — which is the correct home for it and is
  published. Audited against the code: all twelve agree.
- **It IS pinned.** `act-rules.test.ts` drives `ruleFindings` and asserts every produced mapping is
  declared, and separately pins the asserting set as an exhaustive list, so promoting a rule to an
  assertion is a visible edit in two places.
- **The decision HAS been taken**, and its rationale is one line in that test: *"These two read the failure
  directly; everything else infers it."* That is exactly the ACT distinction — a rule stricter or looser
  than its criterion maps as `secondary` — applied deliberately, not overlooked.

**The lesson, which is why this entry survives.** I audited `rules.ts`, found four assertion sites against
eleven rules-owned subtypes, and concluded a design gap from ONE file. The answer was two files away, in
the file whose entire purpose is to state it. Recording a gap that is not one, in the document that exists
to be the trustworthy record of gaps, is worse than not recording it — and I did it while three entries
above were about prose that had drifted from the code.

**Residual, and it is small:** 1.4.2 Audio Control is rule-only with no `rule-ownership.json` entry (no
trained head, nothing to arbitrate), so an audit driven by that file cannot see it. It has an
`act-rules.ts` description declaring `secondary`, so it is documented — just not where ownership is.

## 15. ~~A capture's structure is declared FOUR times, and they disagree~~ — DONE, and it was SEVEN

Found 2026-08-29 while reading `judge.ts`. The shape of `capture.structure` — the sweeps, which are the
central data of this whole tool — is declared independently in four places:

| where | declares |
|---|---|
| `CaptureStructure` (evidence/index.ts) | all seven — **fixed 2026-08-29**, it declared three |
| `CapturedAnnouncements.structure` (evidence/verify.ts) | its own subset |
| `JudgeInput.structure` (judge.ts) | omitted `graphics` until 2026-08-29, while `addUnnamedGraphics` read it |
| `RuleInput.structure` (rules.ts) | `formFields`, `headings`, `links`, `graphics` — no landmarks, lists or tableCells |
| `CaptureEvidence.structure` (local-judge.ts) | all seven |

`RuleInput`'s omissions are currently CORRECT — no rule reads `structure.landmarks` (the two mentions in
`rules.ts` are comments), so declaring it would claim a capability that does not exist. That is the
argument for keeping them separate: each interface says what its consumer actually reads, which is real
information.

The argument against is what happened: `JudgeInput` omitted `graphics` while a rule read it, and nothing
noticed because **object spread preserves what a type does not mention**. Runtime was unaffected; the type
understated what flows, and a caller building the literal by hand would have silently starved the rule.
The same shape as the oracle-counts defect fixed the same day — a comment naming the requirement while the
type enforced none of it.

**DONE 2026-08-29.** Each declaration now derives from `CaptureStructure`, and the concern above turned
out not to bind: nothing needed `Partial<CaptureStructure>` everywhere. `JudgeInput` reads the whole thing
and IS `CaptureStructure`; the others use `Pick<>` or `Partial<Pick<>>`, so every omission stays a visible
decision rather than an accident. `tsc` then enforces the keys — a `Pick` of a field the wire does not
carry does not compile.

**There were SEVEN, not four**, and the extra three were found only by running the discovery test rather
than by working the list: `cli.ts`, `judge-file.ts` and `evidence-units.ts`. That is the argument for
discovering over enumerating, in a gap entry that had itself enumerated.

`ScorableCapture` in `evidence-units.ts` keeps its `[other: string]: unknown` index signature, because it
is an allowlist of what the model READS rather than a description of what a capture carries — the three
named fields derive, everything else passes through untyped and unread. Deriving them made the exclusion
of `landmarks` a visible `Pick` rather than an omission somebody might "fix", which is what that file
argues for at length.

`structure-declarations.test.ts` fails on any inline restatement naming three or more sweep fields —
mutation-checked by putting `cli.ts`'s back.

## 16. ~~The discriminative gate's rules-owned list is frozen at two criteria of nine~~ — DONE

Found 2026-08-29 reading `verify-gate.ts`. `ABSENCE_CRITERIA = new Set(["1.1.1", "4.1.2"])` decides which
findings the gate drops so the deterministic rule's authoritative one can stand. It was correct when the
rules owned exactly those two.

`rule-ownership.json` now declares many more as `decidedBy: "rules"`: 1.1.1, 1.3.1, 2.1.1, 2.1.2,
2.4.1, 2.4.2, 2.4.3, 3.3.2 and 4.1.2. Deliberately listed rather than counted — `criteria-counts-are-not-
spelled-out.test.ts` refuses a numeral beside the word, and it caught this entry's first draft.

> **STALE, verified 2026-09-05 — this list is illustrative history, and the MECHANISM it describes is what
> actually stays correct.** `ABSENCE_CRITERIA` in `verify-gate.ts` today reads 1.1.1, 1.3.1, **1.4.13**,
> 2.1.1, 2.1.2, 2.4.1, 2.4.2, 2.4.3, **3.2.1, 3.2.2, 3.3.3**, 4.1.2 — twelve criteria, not nine, and
> **`3.3.2` is no longer among them at all**: `3.3.2:unnamed-form-field` was reclassified to
> `4.1.2:unnamed-control` on 2026-09-05 (its evidence was always 4.1.2's, per `docs/backlog.md`'s own
> "ALL 133 `3.3.2:unnamed-form-field` records were labelled for a criterion their page SATISFIES" entry),
> so a set frozen at this paragraph's nine would now be both incomplete AND wrong about one member. This
> is not a live defect, because — as the paragraph below already argues — the constant is **derived and
> tested equal to `rule-ownership.json`** by `rules-owned-criteria.test.ts`, which is exactly the guard
> that makes an illustrative list in prose safe to go stale: the code cannot. Left as a correction rather
> than a rewrite, because the next criterion added will make this note stale too, and the paragraph below
> already says why enumerating here was never going to be the durable part.

So a generative model's 1.3.1 or 3.3.2 finding survives the gate — and then SUPPRESSES the rule's, because
`withRuleFindings` adds only rule findings "whose criterion the model did not already flag". The model's
weaker finding wins over the rule's exact one, which inverts the ownership design.

**Reachable only on a path nobody runs by default**, and that is why it is recorded rather than urgent:
`applyGate` runs for the GENERATIVE backends only (`local` is the default and skips it), and `ENABLED`
additionally requires `JUDGE_GATE=on` plus a local ONNX model at `GATE_MODEL_PATH`.

**Not fixed by widening it to `RULE_CRITERIA`**, which is the obvious move and the wrong one: that list
contains 2.4.4, whose ownership is `overlap` — the rules cover a deliberate subset and the head owns the
rest — so dropping the model's 2.4.4 would discard the half nothing else supplies. The correct source is
the `decidedBy: "rules"` set, and it lives in `packages/lab/rule-ownership.json`, which this package cannot
import.

**DONE 2026-08-29.** `ABSENCE_CRITERIA` now holds the nine criteria the rules own AND report under their
own criterion, and `rules-owned-criteria.test.ts` — in the LAB, which can see both — derives that set from
`rule-ownership.json` and refuses any difference. The artefact route this entry proposed does not work
here: `applyGate` runs for the GENERATIVE backends, which never load the model artefact `ruleOwned` rides
in. Pinning the two sides equal where both are visible is the remedy that does, and it is the same one
`name-normalisation.test.ts` uses.

**Both halves of the membership test are asserted, not just the first.** A criterion qualifies when the
rules decide the subtype AND report it under that subtype's own criterion — one they decide but report
elsewhere must not be suppressed, or the model is silenced while nothing supplies a finding and the
criterion is decided by neither layer. `2.4.4` stays out, as this entry required, because its ownership is
`overlap`; a mutation adding it fails with that reason named.

**A stale example found on the way.** `score.py` states the same test and cites
`3.3.2:unnamed-form-field` as "decided by the rules and reported as 4.1.2, so it is NOT owned here". That
subtype reports as **3.3.2** in both `rule-ownership.json` and the shipped training report. The rule the
comment states is right and is the one implemented; only its example is wrong, and it is corrected beside
the new set rather than left to mislead the next reader.

## 17. ~~`landmark_present` is a model feature whose zero always means the SWEEP failed~~ — DONE, REMOVED

Measured 2026-08-29, and only measurable because C1 exists — this is what the completeness work was for.

`screenreader_features.py` computes two structured features from `structure.landmarks`:

```
values["landmark_present"] = float(bool(landmarks))
values["landmark_named"]   = float(any(named_landmark(v) for v in landmarks))
```

On 80 fresh protocol-7 captures, **16 have `landmark_present = 0`, and all 16 have a TRUNCATED landmark
sweep** — the page exposes landmarks and quick navigation did not reach one. **Zero are genuinely
landmark-free.**

So the feature does not mean what its name says. It reads as "the page has a landmark"; it measures "the
sweep reached one". The model is being taught a feature that encodes an artefact of the capture, and the
artefact has a known cause: quick navigation cannot reach a landmark containing the caret, so a
page-wrapping `<main>` is systematically missed.

**The exclusion already exists one layer over, and did not reach here.** `evidence-units.ts` states at
length that "`landmarks` is deliberately NOT a model feature", with the measurement: the same unchanged
page gave `[]` in one capture and `["Cycling guide"]` in the next, swinging a CONFORMANT page's 3.3.2
score from 0.004 to 0.39 across a 0.35 threshold. That exclusion covers the ENCODER's text units. The
STRUCTURED features kept the field, and no comment, doc or ADR anywhere discusses it.

**What was checked and REFUTED**, so nobody re-derives it: this is not a train/serve skew and not an
ADR 0015 free veto. `landmark_present = 1` on 80% of corpus captures and 88% of real pages — the
distributions match, and the feature is not constant on either side.

**DECIDED 2026-08-30: both features REMOVED**, and the reasoning now sits beside where they were computed
rather than only beside the encoder's exclusion. `FEATURE_SCHEMA_VERSION` moves v15 -> v16.

The measurement decides it. The feature's name claims "the page has a landmark" and its negative class is
**100% capture artefact** — 16 of 16 zeros are truncated sweeps, none is a landmark-free page — with a
documented systematic cause. A feature whose 0 always means "the sweep failed" teaches the head about the
INSTRUMENT, not the page. `landmark_named` shares the source and the artefact: an unreached landmark is
also unnamed.

**The measurement was re-checked against this session's completeness fix before it was trusted.** That fix
changed how `unnamed` elements are counted for every type EXCEPT landmarks, which already counted them —
so landmark verdicts are unchanged and the 16-of-16 figure still stands.

**Why not the `unknown` option this entry suggested.** It is unreachable from here. The heads are
`torch.nn.Linear`, which can only ADD, so "unknown" needs a companion MASK feature rather than a middle
value — and the census that would supply the true answer lives in `ruleEvidence`, a deliberate SIBLING of
the model's input that the featurizer may not read. Removal is the option that does not cross that
boundary.

**This OPENS a schema migration**, which is the intended consequence and what `scorer:migration` exists to
report: the shipped v15 weights cannot be scored by a v16 runtime. It closes when a v16 candidate is
trained and promoted — no recapture and no re-export, because the features are computed at train time from
an unchanged `record.input`.

**CLOSED — confirmed 2026-09-05.** `screenreader_features.py` no longer computes either feature (the
removal is commented in place, citing this section by name), and the shipped schema has since advanced
past v16 to v18, with v19 pending (see §35). The migration this paragraph opened necessarily passed through
v16 to get there.

## 18. ~~`dedupeKey` strips ONE container prefix, so a nested landmark is recorded twice~~ — DONE, protocol 8

**DONE 2026-08-30, and it rode the bump it was waiting for.** `CAPTURE_PROTOCOL_VERSION` 7 -> 8, applied
together with §19 — each needed a full recapture on its own and neither was urgent, so paying once is the
whole point. `dedupeKey` now strips to a FIXED POINT, bounded at four containers (the deepest observed in
24,774 corpus announcements is two).

The bounded assertion this opened in `capture-pure.corpus.test.ts` (`<= 146 known non-idempotent keys`) is
strict again.

**Requires a recapture to take effect.** Until one runs, captures on disk carry the old keys — which is
old evidence, not a regression, and the test says so.

`CONTAINER_PREFIX` in `capture-pure.mjs` removes one leading container announcement. NVDA announces *every*
container it entered, so a nested one survives and the same element keys two ways:

```
"main landmark, Home energy, region, Home energy"     <- reached from outside
"Home energy, region, Home energy"                    <- reached from inside
```

`collectPhrase` keys on that, so `structure.landmarks` reports **3 landmarks on a page with 2**.

**Measured** (5,304 captures on the local copy): 146 of 24,774 sweep announcements are affected, in **34
captures, every one a `landmark-*` case**. The transcript channel is clean — 0 of 35,647 — because
`dedupeKey` is never applied to it.

**Blast radius, checked rather than assumed.** No rule counts the list. The model's `landmark_present` and
`landmark_named` are booleans, so an inflated list does not move a feature. `sweptElements` sets names, so
the completeness verdicts added in the capture-integrity work collapse it too. Nothing downstream reads a
wrong answer *today* — which is exactly why it survived, and exactly why it must not be forgotten: the
first check that compares a sweep's LENGTH to a census will read a phantom as evidence of completeness.

**Why it is not fixed now.** `dedupeKey` runs at capture time, so the fix changes `structure.*` and needs a
protocol bump plus a full recapture. Applying it without one produces a corpus where some captures deduped
twice and some once — the mixed-evidence state the cache key exists to prevent. A recapture was in flight
when this was found; paying for a second one to remove 146 duplicate strings is the wrong trade.

**The fix, verified against the corpus:** apply the strip repeatedly until it stops matching. Measured on
all 24,774 sweep announcements — 146 keys change, **0 are reduced to empty**, which is the over-strip
signature this would otherwise risk. Do not reorder `heading_name`-style strip-before-split logic while
doing it: `"Supplier form, heading, level 1"` is a real corpus h1 whose accessible name *is* "Supplier
form", confirmed against that capture's `structureCensus`.

**What tells you it is fixed:** `capture-pure.corpus.test.ts`'s bounded assertion becomes a strict
`assert.equal(dedupeKey(key), key)` over the sweep channel, and passes.

**How it hid.** `capture-pure.corpus.test.ts` guarded `dedupeKey` and read only `capture.transcript` — the
one channel `dedupeKey` is never applied to. It even carried a `>= 1000` anti-vacuity floor, added to stop
exactly that, and the floor was satisfied by the wrong data. *A guard pointed at the wrong evidence channel
is the count-based check in a new costume.*

## 19. ~~69 cases are labelled `1.3.1:unassociated-table` and none captures a table cell~~ — DONE, protocol 8

Found 2026-08-29 while diagnosing a `rules:gate` failure that turned out to be something else entirely.
Recorded because the investigation is the only reason anyone looked.

`position-only-table` is an accompanying defect: it injects a `<table>` with no `scope`, adds the label
`1.3.1:unassociated-table`, and declares `grants: "table_position_only"`. Measured over the built case
list: **69 cases pair it, and all 69 have `probeTables: false`** — because `withAccompanyingDefects`
spreads `...template`, inheriting the HOST's probe settings, and no host that pairs a table probes one.

So `structure.tableCells` is `[]` on every one of them. The label claims a defect whose rule-side evidence
was never captured.

**Nothing fails today, and the reason matters.** No rule reads `tableCells` — `1.3.1:unassociated-table`
is not in `rule-ownership.json` at all, so the subtype belongs to the model's head, and
`table_position_only` is computed from the TRANSCRIPT, which carries the table fine. `corpus:grants-audit`
therefore passes, correctly: the FEATURE is present. Two consumers of one defect, and only the absent one
needs the probe.

**What would break.** The moment a deterministic rule for unassociated tables is written — the natural
next step, since 1.3.1's declared channels already include `tableCells` — it will find nothing on all 69
and read as a rule that never fires. That is `rules:coverage`'s *"NEVER FIRED ANYWHERE — the claim rests on
nothing"*, pre-arranged.

**DONE 2026-08-30, bundled with §18's protocol bump** — which is exactly the condition this entry set. On
its own it cost 138 recaptures to populate a field nothing reads; alongside a bump that recaptures anyway,
it costs nothing extra.

An accompanying defect now declares `probes: { probeTables: true }` and `withAccompanyingDefects` UNIONS
them over the host's. A union and never an override: a host that already probes keeps doing so, and no
defect can turn a probe OFF. `probeForms` is deliberately unreachable this way — no defect declares it and
`accompanying-probes.test.ts` refuses one that does, because making this tool press buttons is a decision
for the case author, not a side effect of a pairing.

The guard is by SHAPE, not by list: a defect whose markup contains a `<table>` and does not declare
`probeTables` fails, so a second opt-in channel is caught by the same rule rather than by someone
remembering this entry.

**What tells you it is fixed:** every `+also-position-only-table` case carries `probeTables: true`, and
`structure.tableCells` is non-empty on their bad variants.

## 20. ~~`candidate:gate` audits the SHIPPED weights, not the candidate~~ — DONE

Found 2026-08-30 when a promote was refused and the refusal did not describe the model being promoted.

`candidate:gate` chains `npm run scorer:shortcuts`, and that script's `--model` defaults to
`packages/scorer/models/screenreader-scorer` — the SHIPPED weights. The candidate-specific variant
`scorer:shortcuts:candidate` exists (`--model runs/model-candidate`), is wired into `lab-job.yml`, and is
**not** the one the gate runs.

**Measured on the same corpus, same audit, both models:**

| model | positives | closable | total | sum logits | worst |
|---|---|---|---|---|---|
| shipped v15 | 142 | 1 | 1 | −5.13 | `table_header_associated` |
| candidate v16 | 142 | **0** | 1 | **0.00** | — |

So the v16 candidate takes NO closable veto on that subtype and was refused for a −5.13 weight belonging
to the weights it was going to replace.

**This is the repo's most-recorded shape, inverted.** The usual form is *"a gate that does not exercise
what ships"* — `JUDGE_BACKEND` defaulting to `codex` while the Action shipped `local`, the abstention sweep
scoring raw predictions rather than the product path, `npm run eval` resolving the shipped artefact so a
candidate's judge quality was unknowable until after promotion. That last one is this one exactly, one
gate over: **a gate meant to decide a candidate, examining the incumbent.**

**Note what it does NOT change.** The baseline comparison would still fire for the candidate — it carries
1 TOTAL veto against a baseline of 0, and the comparison is on totals by deliberate design
(`compare_to_baseline`'s docstring: an unclosable veto is still a negative weight, so counting it "cannot
let a genuine regression through"). Fixing the model the gate reads makes the refusal *true about the
candidate*; it does not by itself unblock the promote.

**DONE 2026-08-30.** `candidate:gate` now passes `--model runs/model-candidate` to the shortcuts audit and
KEEPS the baseline comparison — reaching for `scorer:shortcuts:candidate` would have fixed the model and
lost the regression check, which is the failure mode of every "make the gate pass" change.

`candidate-gate-examines-the-candidate.test.ts` walks the chain rather than asserting one string: no stage
may resolve `packages/scorer/models`, the shortcuts stage must name the candidate explicitly (the DEFAULT
is the quiet form of this defect — a stage passing no `--model` reads the incumbent while looking
innocent), and no stage in the resolved chain may carry `--no-baseline`.

**Its own first version was a half-guard**, and mutation showed it. The `--no-baseline` check matched
`candidate:gate`'s own text, so swapping in `scorer:shortcuts:candidate` — where the flag lives one script
away — sailed past it and was caught only by the `--model` assertion. A guard that passes because the
defect moved is not a guard; it now resolves each stage's body.

## What is NOT on this list, deliberately

- **`1.3.1`** — closed. `29/29 rules: EXACT`, validated on a real page. Was "the claim rests on nothing"
  for the life of the rule.
- **The `1.1.1` census rule** — closed by the same change, and it was the worse of the two: sibling rules
  fire, so its criterion read "validated on real evidence" the whole time it was unreachable. Corpus
  evidence went **350 → 734**.
- **`worker:code` crashing with no local VM** — checked, does not. That trace was UTM launching.

## The pattern behind most of these

Almost every defect found on 2026-08-26 was **a diagnostic that could not report itself** — a fetch that
failed and reported success, a guard that fired correctly and crashed writing its own message, a status
command reading another job's file, a fault losing its diagnostic to swapped arguments, a metric merging
two different facts.

The system was largely working and very hard to see working. See CLAUDE.md, *"A diagnostic that cannot
report itself"*, for the six and the three habits that would have caught them.

---

## 25. ~~The CLI could not ask for two probes the real-page corpus has always asked for~~ — DONE 2026-09-02

Found by auditing what the SHIPPED product can reach, rather than what the lab can. The answer was: less
than the lab, on three criteria this project headlines.

`packages/lab/src/training/capture-real-pages.mjs` sends
`{probeForms: false, probeFocus: true, probeNavigation: true, probeFocusContext: true}` — the settled
judgement about what may be done to a page we do not own, with the consent argument written out beside it
in twelve lines of comment. `probeNavigation` has been on since 2026-08-24, `probeFocusContext` since the
morning of 2026-09-02.

**`cli.ts` had neither flag. Not off — absent, with no way to turn them on.** It sent exactly
`{probeForms, probeFocus}`.

| criterion | rule | reachable from the CLI before this |
|---|---|---|
| 2.4.1 Bypass Blocks | `addInertSkipLink` | **no** — needs `interaction.routeChange` |
| 2.4.2 Page Titled | `addStaleRouteTitle` | **no** — same channel |
| 3.2.1 On Focus | `addContextChanges` | **no** — needs `interaction.focusContext` |

Two of those three are on the short list of *"three criteria a static analyser structurally cannot
reach"*, which is the clearest statement of what this tool is FOR. They were unreachable by this tool as
shipped, and had been validated on 86 conformant real pages through a path the product does not take.

**Why it was invisible, which is the part worth keeping.** An un-asked probe leaves an empty channel, and
an empty channel is indistinguishable from a page with nothing to report — this repo's oldest defect,
recorded a dozen times and here reaching the product boundary. `observed` was built precisely to end that
ambiguity and did its job perfectly: it recorded `asked: false` on every CLI capture ever taken. Nothing
in the product read it back to the user, so the honest answer sat in the JSON and never became a
sentence. **A three-valued field nobody renders is a two-valued field.**

**Why the existing guard could not catch it.** `probe-chain.test.ts` was written for exactly this defect —
a probe flag dropped between hops — after it happened twice in two days. It walks five hops and derives
its flag list from `CASES`, so it is thorough about the path it covers. Every one of those five hops is
the LAB's. The CLI is a sixth hop outside the chain, and the corpus case definitions cannot name a flag
the product ought to send. *A gate that does not exercise what ships is not a gate* — the fifth instance,
and the first to reach a user-facing default rather than an internal one.

**Fixed** by defaulting both ON in `cli.ts` (with `--no-probe-navigation` and `--no-probe-focus-context`),
which the GitHub Action inherits. `probe-consent.test.ts` now pins the CLI's defaults equal to the
real-page corpus's request body, reading both out of source so neither can drift again — the remedy this
repo prefers over remembering. Mutation-checked by deleting the `probeNavigation` default and confirming
it fails naming the flag and the side that lacks it.

**Deliberately unchanged:** `probeForms`, `probeTyping`, `probeArrows`, `probeDialog` stay off for a page
we do not own. They write to somebody's system or press keys inside their widgets. The line moved for two
probes that only Tab and follow a link — which `probeFocus` already did on every capture — and not for
the ones the line was drawn against.

---

## 26. ~~The report says "untested" for criteria axe answered in the same run~~ — DONE 2026-09-02

Found 2026-09-02 while checking what the shipped product can actually reach, which is also how §25 turned
up. This one is a REPORTING defect rather than a coverage defect, and the distinction is the whole entry:
the tool already has the answer and declines to say it.

`criterionOutcomes()` builds its covered-set from `assessedCriteria()`, which `coverage.ts` pins to the
trained model's own criteria plus the deterministic rules — **the screen-reader layer only**. Every
criterion outside that set gets a fixed sentence:

```
outcome: "untested"
reason:  "No assessor in this tool covers this criterion. It is unchecked, not clean."
```

That sentence is false in any run where the axe layer answered the criterion. The CLI runs axe **by
default** (`--no-axe` opts out), prints `Scanning <url> (rule-based axe-core + real screen reader)`, and
then reports as though only the screen reader ran.

| criterion | axe rule | in a default CLI scan | the report says |
|---|---|---|---|
| 3.1.1 Language of Page | `html-has-lang` | runs | `untested` |
| 1.3.5 Identify Input Purpose | `autocomplete-valid` | runs | `untested` |
| 2.5.3 Label in Name | `label-content-name-mismatch` | runs | `untested` |
| 2.1.4 Character Key Shortcuts | none | — | `untested` — **correct** |

**What makes it cheap: the join key already exists.** `packages/cli/src/scan/axe.ts` parses criterion
numbers out of axe's tags — the comment says so outright, *"axe tags include `wcag143` for SC 1.4.3;
extract criterion numbers"* — and `AxeFinding.wcag` carries them. Nothing consumes them for coverage.

**What it must NOT become: one undifferentiated "assessed".** ADR 0021's whole subject is that the layer
which decides must be the layer allowed to claim, so a finding's ASSESSOR is provenance the report has to
carry. axe is a rule layer and may therefore assert — that part is compatible — but a criterion answered
by axe and one answered by the screen reader are different claims about different evidence, and merging
them silently would undo the distinction this project exists to make.

**What would tell you it is fixed:** a default CLI scan of a page with `<html>` and no `lang` reports 3.1.1
as failed, naming axe as the assessor; and a scan with `--no-axe` reports it `untested` again, for the
right reason.

**CLOSED 2026-09-02.** `criterionOutcomes` takes a second assessor. `AxeResult` now carries a
`coverage` map — criterion to `violated | needsReview | clean` — folded from all four of axe's result
buckets, where before this module kept `violations` and threw the other three away.

**The judgement that took the research, and it went the conservative way.** A CLEAN rule result reports
`cantTell`, never `passed`. Reporting `passed` because a rule engine found no violation is the *false
assurance* the literature names directly — *Inclusive Design for Accessibility* puts it as a tool
confirming alt text is PRESENT while saying nothing about whether it is meaningful. Deque's own study
across 13,000+ pages measures automated coverage at **57% of issues**, and separately notes only **16 of
the 50** WCAG 2.1 AA criteria are machine-evaluable at all. So "axe found nothing" supports *not shown to
fail*, never *satisfied*. That is still strictly more than before: `untested` said we had not looked, and
we had.

**Three things fell out that are worth more than the fix.**

- **The assert/refer line is axe's OWN.** `violations` become `failed`, `incomplete` becomes `cantTell` —
  axe already separates what it is sure of from what it wants a human to see, so the confidence boundary
  is the engine's judgement rather than one invented here.
- **An imported `--axe-results` file supports LESS, and now says so.** Many reporters emit `violations`
  and nothing else, so on that path a criterion with no violation may have been checked and passed or
  never checked at all. Only violated criteria are recorded from such a file; the rest stay `untested`.
  The same absence-versus-evidence distinction this repo has paid for a dozen times, at the report edge.
- **An inapplicable RULE does not make the CRITERION inapplicable.** axe means "this rule found no
  elements"; the criterion may have aspects no axe rule covers.

`assessor` is now on `CriterionOutcome` and rendered in the tag — `[failed · axe-core]` — because ADR 0021
turns on which layer may claim what, and a consumer should not have to regex a sentence to find out.

Mutation-checked by making a clean result report `passed` and confirming the test fires. **Note the trap
inside that check:** cross-package imports resolve to `dist`, so the first mutation run passed having
changed nothing. `npm test` has a `pretest` build and is safe; `npx tsx --test` run directly is not.

---

## 27. ~~Readiness could not see a foreground holder, and its dialog sample was from BOOT~~ — DONE 2026-09-02

Backlog stage 2. Two defects, and the second was found while fixing the first and is the worse one.

**A modal blocks INPUT; a toast blocks FOCUS. Only the first was checked.** On a11y-worker-6, 2026-09-02,
a `ShellExperienceHost` notification toast held the foreground for three and a half hours. Edge could
never take focus, so every capture wedged — and because a toast is not a dialog, `listBlockingDialogs`
returned nothing, `noBlockingDialog` stayed `true`, and the worker advertised itself `ready` throughout.
From the run's side that is indistinguishable from a slow page, so it waited, and a corpus recapture made
no progress at all.

`foregroundBlocker` is now a pure predicate over the foreground sample, gated in `readiness()`, and
`/health` names the owner and title rather than the check — the distinction `blockingDialogs` already
made for modals.

**The tempting predicate was wrong and would have taken the fleet offline.** "The foreground does not
belong to Edge" is TRUE ON EVERY IDLE GUEST: an idle desktop's foreground belongs to explorer, and a
capture launches Edge into the foreground from there perfectly well. What breaks a capture is a window
that refuses the transition, and only some windows do. So it is an explicit list with the incident
attached to the entry that earned it, and the other two marked as inferred from sharing the mechanism
rather than observed. My own backlog row had specified the wrong predicate; writing the test is what
caught it.

### The one that had been running the whole time

`sampleDesktopDialogs` carries a comment stating its own design: *"the sample that matters is the one at
the START OF A CAPTURE, where a dialog actually blocks work."* **There was no such sample.** The only
call is at boot. At capture start the cache was refreshed ONLY when a dialog had been dismissed — so a
guest that never had one served its boot-time answer for as long as it stayed up. Workers up six days
were reporting `dialogsCheckedMsAgo` around 8,640 minutes, which is `/health` saying *"no dialogs, as of
last week"* while the field beside it was built precisely to stop that reading as current.

`dismissBlockingDialogs` has already enumerated at that point, so the current state was available for
free and was being thrown away. **"Dismissed none" and "never looked" were the same state** — this
repo's oldest defect, wearing a cache.

**Neither bumps `CAPTURE_PROTOCOL_VERSION`.** A readiness check and a `foregroundBlocked` diagnostic mark
change nothing about what the evidence MEANS, so this is additive exactly as `fault` was. It does change
`codeVersion()`, so the fleet reads stale until deployed — which is `assertFleetRunsThisCheckout` working.

**Boy-scout, in passing:** `runCapture` crossed the 90-line physical budget, so the desktop preparation is
now `prepareDesktop` — extracted because it does one thing at one level of abstraction, not merely to
shorten its caller. `function-size.test.ts` caught it; ESLint could not, because `skipComments: true`
lets a comment-dense function run to twice its budget.

---

## 28. ~~Four criteria were unreachable on a page we do not own~~ — WORKING 2026-09-02

Backlog stage 3, and [ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) built.
3.3.1, 3.3.3, 4.1.3 and 3.2.2 need a form submitted or typed into, and those probes are off for a page we
do not own. What makes submitting acceptable is the site's owner telling us what to put in — so the
consent problem was an API problem, and this is the API.

**Proven, not asserted.** Against `w3.org/WAI/tutorials/forms/labels/` with real NVDA:

```
formFill: {"state":"error","filled":[{"field":"Search","action":"type"},
                                     {"field":"First name:","action":"type"}],
           "unbound":[],"submitted":true}
```

Both controls located by **accessible name** — the decision everything rests on, and the one that pays a
dividend no selector-based design can: a field that cannot be addressed by its accessible name is a 4.1.2
FINDING, not a configuration error, because a screen reader user cannot address it either.

### Four defects, every one found by running it rather than by reasoning

| what happened | why no unit test would have caught it |
|---|---|
| a BUTTON was drafted as something to type into | `structure.formFields` is NVDA's form-field quick-nav and it VISITS buttons — the census comment says so, and nothing in the schema knows that |
| a labelled `"Subscribe to newsletter, check box"` reported as UNNAMED | the grammar could not see a checkbox at all (§27 sibling; `CONTROL_ROLES` had `"checkbox"`, NVDA says `"check box"`) — a false 4.1.2 against conformant markup |
| `interaction.formFill` came back NULL while the marks read `filled: 1, submitted: true` | the returned interaction is assembled from a HAND-WRITTEN field list and the new field was not on it — this repo's most-repeated shape |
| the walk filled one field of two and reported the other `unbound` | `applyFill` ends in `restoreBrowseMode`, which ANCHORS — so the caret returned to the end of the document and the walk's position was gone |

**And one wrong turn worth more than the fixes.** Diagnosing the fourth, the walk was ALSO switched from
forward to backward, on the reasoning that `anchorToTop` presses `Control+End` so forward navigation from
the end finds nothing. It filled **zero** fields where forward filled one. NVDA's quick navigation WRAPS,
so `moveToNextFormField` from the end lands on the first field and reads the page in order. Two things
changed at once and the result got worse, which made neither attributable — the re-anchoring was the fix
that had been diagnosed and the direction was a guess riding along with it.

### The criteria ARE decided, and this section said otherwise for an hour

The paragraph here claimed the captures ran but no criterion was decided from them, because
`criterionOutcomes` does not read `formFill`. **It does not need to.** `probeConfiguredForm` submits
through `activateAndCaptureDelta`, deliberately, so a configured submission produces evidence of exactly
the same SHAPE as an opportunistic one — and `formChanges` is the channel 3.3.1 already reads. Measured on
the same page:

| | 3.3.1 | 3.3.3 | 4.1.3 |
|---|---|---|---|
| without a config | inapplicable | inapplicable | inapplicable |
| with a configured error state | **passed** | inapplicable | **passed** |

`inapplicable` there means *"the page exposed nothing of the kind this criterion is about"* — which was
true only because nothing had submitted the form. So a config moves two criteria from unexamined to
examined on a page we do not own, which is the whole of what ADR 0024 was for.

**Recorded because the wrong claim is instructive.** It was written from reading the code — `formFill` is
a new channel, nothing reads it, therefore nothing is decided — and it was refuted by running the rules
over a real capture in one command. The evidence never needed a new channel; it needed to land in an
existing one, which is what reusing `activateAndCaptureDelta` bought. *A cheap pre-check is for deciding
whether to bother running the real one, never for concluding what the real one will say.*

**3.3.3 stays `inapplicable` correctly:** the W3C search form accepted an empty query, so there was no
error message to carry a remedy. 3.2.2 needs `probeTyping`, which that raw request did not ask for.

**What is genuinely still open** is real-page GROUNDING for 4.1.3 — a conformant and a failing page, both
configured — which is [known-gaps §21](./known-gaps.md) and now unblocked rather than blocked.


---

## 29. `4.1.3` grounding is reachable, and the pair that proves it also proves ADR 0024's central claim — CLOSED 2026-09-05: the capture RAN, and `4.1.3: 0 of 37` is still the honest number

**CORRECTED 2026-09-05, hours after the entry below was first written, and the correction matters more
than the mistake: I inferred `4.1.3: 1 of 37` from a count instead of reading the code that produces the
number, and it was wrong.** What I actually checked was that `real-page-corpus.mjs` carries exactly one
`formState` entry, and I reasoned from that straight to the realism-tier count without reading
`build-realism-tier.mjs` itself. Two independent things make `1 of 37` unreachable, and both are in that
file, not in anything that needed a capture to discover:

1. **The one page carrying a `formState` — `w3.org/WAI/demos/bad/after/survey.html` — is `role:
   "calibration"`, and `build-realism-tier.mjs`'s filter is `realPageFor(url)?.role === "training"`.**
   Calibration pages are excluded from the realism tier by construction — *"they are the measurement, and
   training on them would destroy the only independent read we have."* The page that grounds 4.1.3 can
   never enter the count this section was asking about, no matter how many times it is captured.
2. **`build-realism-tier.mjs` already argues, at length, that `0 of 37` is the honest number for the
   OTHER masked channel.** `routeChange.announced` is deliberately excluded because `probeNavigation`
   follows the FIRST link, which on essentially every real page IS the skip link — labelling that silence
   4.1.3 would teach the head that silence after any link is a failure, on 37 pages at once. That
   reasoning does not depend on whether the survey page exists at all.

**The lab confirmed it directly: `4.1.3: 0 of 37` after the capture, exactly as both mechanisms predict** —
not a run I performed, but the number the `everything` chain printed, which is the authoritative one.

**What the capture actually proved, and it is real.** `w3.org/WAI/demos/bad/after/survey.html` came back
with `interaction.formChanges` holding 2 entries and `postSubmitFields` holding 15, sweep log `submit
"submit, button" -> "Citylights Survey - Submission Failed Accessible Survey Page, document"` — the
configured form was genuinely filled and genuinely submitted on a real site. **4.1.3 is now grounded on a
real page as a CALIBRATION measurement**, which is what a calibration page is for: the abstention sweep and
the false-positive count can see it, even though the realism tier structurally cannot.

**What would actually move the realism number** is stated in `build-realism-tier.mjs` and is corpus work,
not capture work: a real TRAINING-role page where the pressed link is known to be a FILTER rather than a
skip link — a fact about the page, belonging in `real-page-corpus.mjs` beside `claimExcludes`.

Everything below is the reasoning that established the capability was there before the capture proved it,
kept for the same reason superseded sections elsewhere in this file are kept.

[§21](#) said closing 4.1.3's real-page gap was *"a CONSENT decision rather than a code one"*: the heads
read `formChanges` / `postSubmitFields`, and `probeForms` is off for every real-page capture because
submitting a form on a site we do not own is not a review.

**[ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) made that decision.** Consent comes
from the site's owner supplying the values. Measured 2026-09-03 against W3C's own accessibility demos —
the same survey page in its fixed and broken versions, driven with the SAME config:

| | fields filled | unbound | submitted | what NVDA said after |
|---|---|---|---|---|
| `after/survey.html` (conformant) | **3** | 0 | yes | `"Citylights Survey - Submission Failed …"` |
| `before/survey.html` (inaccessible) | **0** | **all 3** | no | — |

`3.3.1` and `4.1.3` both read **`passed`** on the conformant page, from real evidence on a real site. That
is the gap §21 describes, closed by configuration rather than by relaxing the consent line.

### The inaccessible half is the more interesting result

Not one field could be filled — and that is not a limitation of the tool, it is the finding. What NVDA
announced on each:

```
conformant     "Explore Site by Topic:, combo box"      "Central Park, radio button, not checked"
inaccessible   "combo box, collapsed, QUICKMENU ---- greater"   "radio button, not checked"   "edit"
```

The broken page's controls have **no accessible names**. The config cannot address them, and neither can a
screen reader user — which is exactly what ADR 0024 claims when it chooses accessible names over selectors:

> A field that cannot be addressed by its accessible name is a FINDING, not a configuration error.

That was written as an argument. This is it happening, on somebody else's real pages, with the conformant
twin as the control. **`unbound` is a 4.1.2 report**, and the two halves of the pair differ by exactly the
property under test rather than by anything about the instrument.

**What remains to CLOSE §21** is the corpus work rather than the capability: `real-page-corpus.mjs` needs a
per-page forms config so `capture-real-pages` can drive configured pages, and `build-realism` then stops
reporting `4.1.3: 0 of 37`. That is bounded, and it is no longer blocked on a decision.


---

## 30. `reportLanguage` shipped INERT twice, and the audit that found it was asked for as forward work

Recorded because the shape is this repo's most expensive one and it arrived in a new place: **a remedy
that is present, reported, and does nothing.**

The setting was turned on by a product decision on 2026-09-03. It was written to
`[documentFormatting]`. **NVDA reads it from `[speech]`.**

**Every check said it was applied.** `getSettings()` returned `documentFormatting.reportLanguage: True`,
read back off a live guest rather than assumed. `/health.environment.screenReaderSettings` carried the
digest. The cache key moved. `fleet-consistency` agreed across all five workers. What none of them could
see is that NVDA does not read that section — so **verifying a setting was WRITTEN is not verifying it is
IN EFFECT**, and from outside the two are identical. That is `refreshBrowseBuffer` guarding on a flag
nobody ever set, one layer out.

**Then the fix was inert too.** Correcting the section did not take, because `withIniSetting` searched for
`key = ...` ANYWHERE in the file: on a guest already carrying the stale
`[documentFormatting] reportLanguage = True`, asking for `[speech]` found the wrong one, rewrote it in
place, and reported success. A key name means nothing without its section.

**It invalidated a measurement, and the measurement looked good.** A real page captured before and after
came back byte-identical across every channel and all 89 transcript phrases, and that was reported as
*"reportLanguage is evidence-neutral on monolingual content"*. The simpler explanation was that nothing
had changed at all. Re-taken with the setting genuinely in effect, the result is the same — but it is now
earned rather than an artefact of an inert change.

**What caught it was reading NVDA's own `configSpec.py`**, which had been billed as the cheapest item on
the backlog and turned out to need a zip reader. The audit was asked for as forward-looking work — *which
settings could buy us evidence* — and its first finding was a bug in the change that prompted it.

Both are pinned: `capture-settings.test.ts` asserts the section by name, and a test built from the exact
failing state — the stale key in the wrong section beside the right one — covers the patcher.


---

## 31. A status message fired by a self-announcing control reaches an NVDA user ROUGHLY ONE TIME IN THREE

**A product finding, not a defect**, and [not-working §18](./not-working.md) says outright that it
*"belongs in `docs/known-gaps.md`"*. It was not here until 2026-09-03. Recorded now because it bounds what
4.1.3 can claim, and because it is the most useful thing this project has learned that nobody else can
measure.

Six repeats per condition, one page shape, `training:repeat`:

| trigger | what NVDA says of its own | region | heard |
|---|---|---|---|
| **button**, synchronous update | nothing | `polite` | **6 of 6** |
| **checkbox**, synchronous update | `"checked"` | `polite` | **2 of 6** |
| **checkbox**, synchronous update | `"checked"` | `alert` / `assertive` | **5 of 6** |
| **checkbox**, update deferred 400 ms | `"checked"` | `polite` | **0 of 6** |
| **typing**, six characters | six echoes | `polite` | **0 of N** |

**The behaviour, and every row is consistent with it.** When NVDA has nothing of its own to say, the live
region is the only thing in the queue and it is announced every time. When NVDA is already speaking, a
`polite` region — which by definition waits for idle — is usually dropped, while an `assertive` one
interrupts and mostly survives. Deferring the update past the control's own announcement makes it worse,
not better.

**No static analyser can see this.** The markup is correct, the region is correct, `aria-live` is correct,
and the message is genuinely there. It is exactly the class of failure ADR 0019 says the corpus cannot
express and only a real screen reader can reach.

### What it bounds

**4.1.3 cannot claim a status message was "not announced" from one capture** where the trigger announces
its own state. At 2 of 6, a single silent capture is the expected case rather than evidence. Any 4.1.3
finding on such a control needs repeats or it is reporting a coin toss.

### The advice it lets this project give, with a number attached

**`aria-live="polite"` on a message triggered by a checkbox or a radio reaches about a third of NVDA
users.** Use `assertive` where the message matters — while noting that even that is 5 of 6, and that
choosing a role because it captures better rather than because the content warrants it is fitting the page
to the tool.

### What is NOT established

The mechanism inside NVDA. Six captures per condition shows a direction, not a queue policy. All of it is
one page shape, on one NVDA and one guidepup — both pinned in the cache key, so the number travels with
the evidence it was measured on rather than being a claim about screen readers in general.


---

## 32. 3.1.2's corpus is built and proven, and a SPEECH-ONLY RULE STILL CANNOT DECIDE IT

The case came first, exactly as §17 prescribes, and building it surfaced a limit worth stating plainly
rather than discovering later in a rule that quietly never fires.

**What was built and measured.** Five languages, 29 cases, captured on real NVDA 2026-09-03.
`check-signals` reports **1,623 discriminating, 0 blind, 0 contaminated, 0 uncaptured** — so the signal
fires on the unmarked passage and stays silent on the marked one, on the fleet rather than in a fixture.
Both variants carry the SAME passage; strip the `lang` attribute and the two pages are byte-identical.

**The limit, and it is structural.** With `reportLanguage` on, NVDA announces the language when the
document language CHANGES. So:

| what the capture shows | what it means |
|---|---|
| the language is announced | a passage WAS marked — confirmed |
| nothing is announced | either an unmarked foreign passage, **or a correct monolingual page** |

**Silence is the conformant answer for almost every page on the web.** A rule firing on it would accuse
every English page of hiding a French one. The corpus signal escapes this only because the CASE declares
which language to expect — a luxury no real page offers.

So **the screen-reader layer can confirm a marking and cannot detect its absence.** Deciding 3.1.2 needs
the text itself, which is the DOM, which is axe-core's. `needs: ["screen-reader", "dom"]` was already
right and now says why.

### What the corpus case is worth, given that

Not a rule — three other things, and they are the reason it was still correct to build:

1. **It proved the setting works**, end to end on real NVDA, which nothing else had.
2. **It is paired training data differing by exactly the property under test** — the discipline
   `corpus:starvation` exists to enforce, and the model may separate what a rule cannot.
3. **It is the ground truth a DOM-joined rule will need.** When 3.1.2 is decided by joining axe's view of
   `lang` to the capture's view of what was announced, these 29 pairs are what verifies it.

**Recorded before writing the rule rather than after.** A rule built on the assumption that silence means
failure would have passed `rules:gate` on this corpus — where the case declares the language — and fired
on every conformant monolingual page in the real-page set. That is `2.4.3` going deaf, run in reverse.


---

## 33. `reportEmphasis` cannot work in this pipeline — NVDA implements it only for MSHTML

**REFUTED 2026-09-03, by building the case rather than by reasoning about it**, which is the only reason
it was refuted at all.

The settings audit named `documentFormatting.reportEmphasis` its strongest candidate: it distinguishes
SEMANTIC emphasis (`<em>`, `<strong>`) from text that merely looks bold, which is exactly 1.3.1's question
and a distinction no other channel here can make. To the sweep, to the DOM census and to a sighted
reviewer, `<strong>Do not</strong>` and a CSS-bold span are identical.

**Built, deployed, captured — and `check-signals` reported the case CONTAMINATED.** The signal fired on
BOTH variants, because NVDA said "emphasised" on neither.

**The cause is a rendering-engine limit, not a setting or a page.** NVDA's emphasis reporting reads format
flags that only the **MSHTML** support module supplies — Internet Explorer, or Edge running in IE mode.
This project captures in Chromium Edge, where NVDA does not announce `<em>` or `<strong>` at all. Sources:
[nvaccess/nvda#17216](https://github.com/nvaccess/nvda/issues/17216),
[TPGi, *Screen Readers support for text level HTML semantics*](https://www.tpgi.com/screen-readers-support-for-text-level-html-semantics/).

**Withdrawn entirely — setting, case, family, predicate and fixture.** An inert entry in `CAPTURE_SETTINGS`
would be worse than an absent one: `screenReaderSettings` is a cache-key input, so keeping it "in case"
would invalidate every capture in exchange for nothing. Dead code is worse than absent code.

### Why this is a good outcome rather than a wasted afternoon

**The case is what refuted the setting.** Had `reportEmphasis` been turned on without one — which is what
happened to `reportLanguage`, and is now its own row — it would have moved the cache key, forced a
recapture, and produced no evidence, with every check green because nothing was reading it. §17's rule
earns its keep here in the direction nobody expected: the case did not merely give the probe something to
observe, it proved there was nothing to observe.

**And it corrects the settings audit's own headline.** That document called `reportEmphasis` the strongest
of four candidates on a reading of what the setting is FOR. What it could not know without testing is
whether the browser this project uses supports it. The audit now says so.

**1.3.1 keeps its existing coverage.** Nothing was lost: this was an attempt to ADD a signal, and the
criterion is unaffected by its failure.


---

## 34. The browser is in the cache key, and 2026-09-03 is the first time that was CHECKED

`evidence:check` reported `"unlabeled graphic"` becoming `"unlabelled graphic"` on two sampled captures.
The obvious reading is that NVDA changed a role string, and the backlog asked the right question: does a
version key already cover it, or do those captures need recapturing?

**Measured on the two captures:**

| | NVDA | Edge | says |
|---|---|---|---|
| cached, 2026-08-07 | 2026.1.1 | `151.0.4129.59` | `unlabeled graphic` |
| live, 2026-09-03 | **2026.1.1** | `151.0.4129.107` | `unlabelled graphic` |

**Same NVDA. Different Edge.** So the string is **Edge's**, not NVDA's — it is Chromium's
image-description prompt — and `browserVersion` is in `environmentKey`, so those captures were already
invalid and nothing needs doing.

**Which is the point worth keeping.** `capture-cache.mjs` says the browser is in the key because *"a fleet
can have more than one image"*, and CLAUDE.md argues at length that **the browser is EVIDENCE, not
configuration** — that Edge's preset must stay byte-identical because 2,122 cached captures depend on it.
That was reasoning. This is the first time a browser update has been caught changing announcement text and
the key has been checked against it, and it held.

**And it says where to look next time.** A string that changes with `browserVersion` is Chromium's; one
that changes with `screenReaderVersion` is NVDA's. Both are keyed, and the pair of versions tells you
which vendor to read.


---

## 35. §11's design has a name, and it is a FEATURE CROSS — BUILT 2026-09-03, verdict PENDING

**Audited 2026-09-05: still accurate.** `packages/scorer/models/schema-migration.json` at HEAD still reads
`shippedSchema: v18`, `pendingSchema: v19` — the retrain this section is waiting on has not landed.

**One dependency for gate 1 is now current, and wasn't as of this section's last edit.** `form_change_
observed_absent` reached the tracked baseline as two apparent free vetoes on `3.3.1:validation-error-silent`
and `4.1.3:form-activation-silent` (`not-working.md` §2) — read against `provenance.subtype` and the
featurizer, both are `IMPOSSIBLE_BY_DEFINITION`: the probe that would leave the column 0 cannot fail to find
a control on either subtype by construction, verified at 0 of 500 captures. Classified in
`corpus:unclosable-map` (`e51afa3`). So gate 1 — *"closable vetoes must FALL, and no head may gain one on a
new column"* — will correctly read these two as unclosable rather than as a new column gaining a veto, once
the retrain runs; before this classification landed, the same result would have looked like exactly the
failure gate 1 exists to catch.

**Built and committed; whether it SHIPS is not yet decided.** The encoding is in
`screenreader_features.py`, the exporter emits `observation` as a sibling of `input`, and
`schema-migration.json` declares v18 → v19 open. What has NOT happened is the retrain that would let the
four gates below say whether it helped — the corpus recapture it must land between was still running when
it was written. Until those gates run, this is an implemented hypothesis and nothing more.

**The problem, now sized.** Ten of the 28 structured features are `float(bool(channel))`, and `any([])` is
`False`, so `0` means both *the page has none* and *nothing looked*. Measured 2026-09-03 on the
authoritative corpus: **61.7%** of empty `formChanges`, **56.1%** of empty `postSubmitFields` and **65.3%**
of the `formControl` sweep are "never asked". So the majority of those zeros are artefacts.

**Two routes are closed.** Masking was REFUTED — [§15](./not-working.md), it cost a real finding. Feeding
`observed` to the featurizer as its own column was DECIDED AGAINST — [§14](./not-working.md), because a
feature correlated with capture conditions is ADR 0015's entire subject.

### The design

CLAUDE.md already states the constraint, from the 2.4.4 post-mortem: *"A ZERO CANNOT VETO, so 'A and not
B' must be computed, never handed over as two features. Handing it A and B separately works only if the
model can multiply, and this one cannot."* The heads are `torch.nn.Linear(n, 1)`.

**That construction has a name.** *Low-Code AI* calls it a **feature cross** — *"a synthetic feature
formed by concatenating two or more features … you are considering the value of both variables at the
same time, rather than separately"* — and the three-state encoding it produces is ordinary one-hot for a
categorical whose levels are `present`, `absent` and `not asked`:

| | `..._observed_present` | `..._observed_absent` |
|---|---|---|
| asked, and the page has it | 1 | 0 |
| asked, and the page has none | 0 | 1 |
| **never asked** | **0** | **0** |

**"Never asked" is the all-zeros row, and that is the whole point.** It is representable, and no column
carries a negative weight for a reason that is an artefact of the encoding — which is what §14 was
protecting against. It is not `observed` handed to the model as a feature; it is the existing feature
CROSSED with whether it was measured, so the model never sees "was this asked" as a separable signal.

### What would have to be true to ship it

- `scorer:shortcuts` — closable vetoes must FALL, and no head may gain one on a new column.
- `rules:real-pages` — zero new findings against the 86 conformant pages.
- Held-out acceptance must not regress.
- **The CONSTANT-COLUMN report in `scorer:shortcuts`** — neither new column may read one value across
  the whole corpus. **This gate was named `corpus:distribution` and that was wrong**: it checks whether an
  ARRAY FIELD is empty on every record, and a computed feature is neither a field nor present in the
  export, so it is structurally blind to exactly this. Nothing else could see it either — `starvation`
  asks about a subtype's positives, and the veto audit reads trained weights and, in its own recorded
  words, cannot see constancy at ONE. Built 2026-09-03 where every feature is already computed over every
  record; it is what the dead `state_change_observed_*` pair would have tripped.

**If it fails, it is recorded as REFUTED here and reverted**, the way `skip-link-target-not-focusable`
was. That is a real possible outcome and this entry is not written to avoid it.

**Sequencing:** it moves `FEATURE_SCHEMA_VERSION`, so it lands between a corpus recapture and the retrain
that follows, never after — otherwise the retrain is paid twice.

### What building it settled, and what it did not

**Two pairs, not ten, and NOT the two first chosen.** The other six ambiguous features follow only if
these gates hold — shipping all ten on an untested encoding would make a refutation cost ten reverts
instead of two.

**The first attempt crossed `stateChanges`, and no capture carries `observed["stateChanges"]`.** Both
columns would have read 0 on every record: a dead column, which is worse than a missing one because it
looks like coverage, and only `corpus:distribution` would have caught it — after a full retrain. The
channel is absent from `observed` by DECISION rather than oversight: `probeKindFor` returns `"disclosure"`
BEFORE the `probeForms` gate, so the disclosure probe runs on every capture that meets a control announced
`collapsed`; an empty `stateChanges` therefore means one thing, and a probe that ran and threw pushes an
entry carrying `error` rather than leaving the channel empty.

**So: not every empty channel shares one ambiguity.** That assumption is what produced the dead pair, and
reading `observed`'s own membership would have refuted it before a line was written — the capture declines
to record a question it never had to ask. Crossed instead are `formChanges` (61.7%) and `postSubmitFields`
(56.1%), the two the measurement actually named; the second is the stronger case, since it reads
`asked: true` only when `probeForms` ran AND something was activated, and it is the channel 3.3.1 and
4.1.3 are decided from.

**IT DOES NOT CLOSE THE FIVE `UNREACHABLE_WITHOUT_PERTURBING` ENTRIES, and expecting it to was the error
worth recording.** The cross fixes a CONFLATION. A subtype that never runs the form probe has no
conflation to fix: both crossed columns read 0, correctly, because that is the "never asked" row and the
case genuinely carries no evidence either way. Starvation and ambiguity are two defects and this was only
ever a remedy for the second. The crossed columns are therefore classified in `FORM_PROBE_ONLY` beside
the channels they read — reading them as newly closable would put those five subtypes back on a work list
nobody can complete, which is what that table exists to prevent.

**The first mutation check was not sufficient, and the gap is instructive.** Reverting
`..._observed_present` to the old `float(bool(channel))` left every assertion passing, because no case
exercised the row where `observed` and the channel DISAGREE — `asked: false` beside a channel that has
content. That row is reachable rather than theoretical: `stateChanges` is written by more than one probe,
the disclosure probe running unconditionally while `probeForms` is gated, so a channel can gain content
from a path `observed` did not record. It now has its own case, and the answer is that BOTH columns stay
at zero: a capture whose two records of one probe contradict each other cannot be read as either verdict,
and the all-zeros row already means "this capture cannot say". *A guard must be shown to fail before it is
trusted* — and the first thing this one failed to fail on was its own central conjunction.


---

## 36. The language census does NOT complete 3.1.2, and it enables a different finding worth having — RESOLVED 2026-09-05: the marked-but-silent case was built, measured, and REFUTED

**Audited 2026-09-05 against `case-matrix.mjs` and the backlog row this section is cited from — both already
carried the answer this section did not.** The experiment two paragraphs below (`language-marked-silent-*`,
"built 2026-09-05, awaiting capture") has since run and lost: NVDA hears a `lang` applied by script.

**Measured on `language-marked-silent-poem.bad`, transcript line 3:**

```
"Spanish (not supported), La ciudad duerme bajo una luna clara y el rio sigue su camino."
"list, with 6 items, English, bullet, same page, link, Opening times…"
```

The bet was that NVDA builds its browse-mode buffer at load and would therefore stay silent on a `lang`
applied AFTER load by script — the shape needed for a page to be *marked and silent* rather than merely
*unmarked*. It is not: `refreshBrowseBuffer` rebuilds the buffer once a reused window is re-pointed, picks
the script-applied change up exactly as the original comment allowed for, and the two variants become
indistinguishable in speech — English out, the same language name in, on both. **It surfaced as BLIND**
(the signal fired on NEITHER variant, because `language-unmarked`'s signal keys on the language name being
ABSENT) **rather than the CONTAMINATED the original comment predicted** — the right refutation, the wrong
verdict label, worth keeping as a reminder that a gate's verdicts are not interchangeable.

**Withdrawn on `reportEmphasis`'s precedent ([§33](./known-gaps.md)):** all three `language-marked-silent-*` cases are gone from `case-matrix.mjs`. The residual 3.1.2 question — a
MARKED passage NVDA does not announce — now has **no known trigger left**, since the one mechanism that
looked able to produce it does not. The lead-naming rule these cases taught along the way outlives them and
is guarded in both `acceptance-matrix.test.ts` and `case-matrix.test.ts`.

**This also answers the section's own closing question**, asked below under "What the case should be
instead" — does NVDA's unsupported-language announcement carry the language, a generic phrase, or a beep?
The transcript line above answers it directly: the language name, followed by `"(not supported)"`, then the
text — confirming `reportNotSupportedLanguage`'s `configSpec.py` default (`"speech"`) exactly as predicted,
and closing the one thing that section left for "one capture" to decide.

**What this does NOT change**, because it is a different question from the one just answered: §32's
underlying limit — an UNMARKED passage needs language detection, and the screen reader alone cannot
decide 3.1.2 — still holds, unaffected by the withdrawal of an experiment aimed at the marked-and-silent
case. `3.1.2:language-unmarked` remains `decidedBy: "unavailable"`. Everything below this point is the
record of the experiment that led here, kept for the same reason §2's superseded text is kept: the
reasoning was sound, the premise it tested came out false, and that is worth more than a deletion.

[§32](./known-gaps.md) said the screen reader cannot decide 3.1.2 alone and that deciding needs the DOM.
The DOM census now carries `documentLang`, `partLangs` and `partLangCount`. **It still does not decide
3.1.2**, and stating why is more useful than a rule that quietly never fires.

**What the failure requires.** 3.1.2 fails when a passage is in another language and carries no `lang`.
Detecting that needs the LANGUAGE OF THE TEXT — the census can see which elements are marked, and nothing
in this pipeline can see that an unmarked paragraph is French. That is language detection: a dependency or
a heuristic, and a capability decision rather than a rule.

So the corpus cases remain what they were built to be — ground truth for a future join and paired training
data — and none of the three layers can yet accuse an unmarked passage.

### What the census DOES enable, and it is a real screen-reader finding

**A passage that IS marked and is NOT announced.** The DOM says this text is French; the speech says no
language was announced. The markup is correct and the lived experience is not — which is precisely the
class ADR 0019 says only a real screen reader can reach, and it is decidable today:

```
partLangCount > 0        the page marks at least one passage
AND no language spoken   NVDA announced no language change anywhere
```

Causes it would catch: a `lang` the synthesiser has no voice for, a malformed or unrecognised tag, a
marking inside a subtree NVDA never reached.

**It WAS not built, and the reason was §17's rule rather than effort.** The corpus cases could not exercise
it: the GOOD page is marked and announced, the BAD page is unmarked, and neither is *marked and silent*. A
rule shipped then would have been scored against a corpus with no positive for it — *"a probe built now
would produce evidence nothing could validate"*, arriving at a rule instead of a probe.

> **THE CASE NOW EXISTS — `language-marked-silent-*`, built 2026-09-05, awaiting capture.** Both variants
> end with `lang="fr"` on the same element carrying the same passage, and differ only in WHEN it was
> applied: statically in the markup, or by script after load. The census reads `[lang]` over CDP after the
> page settles, so `partLangCount` is 1 on BOTH; NVDA builds its browse-mode buffer at load, so only the
> static one should be announced. Two pages with an IDENTICAL FINAL DOM that a screen reader tells apart —
> and a static analyser passes both, correctly, because both really are marked.
>
> **It is an experiment, not a closed gap.** If `refreshBrowseBuffer` picks the change up, the signal fires
> on both variants, `check-signals` reports CONTAMINATED, and the case is withdrawn with the measurement
> recorded — as `reportEmphasis` was ([§33](./known-gaps.md)).
>
> **AND THE FIRST ATTEMPT WAS VOID, FOR A REASON THIS SECTION ALREADY GAVE.** It used `xml:lang`, which has
> no effect in `text/html` — sound as a conformance question, and useless here: the rule counts `[lang]`
> ELEMENTS, and that page has none, so its bad variant was indistinguishable from an unmarked one and
> landed straight back in the undecidable fourth case. The paragraph above says the bad page must be
> *marked and silent*, in those words. **Reading it first would have saved building the wrong case**, which
> is this file's own "check the premise before the expensive thing" applied to a document rather than a
> capture.

### CORRECTED 2026-09-04 — "NO LAYER CAN DECIDE 3.1.2" WAS AN OVER-GENERALISATION FROM ONE CASE

**Read the success criterion, which I had not done carefully enough.** 3.1.2 requires the language of each
passage to be **programmatically determined**, and WCAG defines that as *"determined by software from
AUTHOR-SUPPLIED DATA provided in a way that different user agents, including assistive technologies, can
extract and present this information to users in different modalities."*

So the question is not *"what language is this text?"* — which is what I kept answering, and which does
need language detection. It is *"did the author supply data the AT can extract and present?"* The
sufficient technique is **H58, `lang` attributes**. And NVDA announcing the language IS that extraction
happening, in exactly the modality the definition names — which makes the screen reader a WITNESS to this
criterion rather than a layer blind to it.

There are four cases, and this entry collapsed them into one:

| | who can decide it |
|---|---|
| marked, and NVDA announces it | **satisfied, demonstrated in the AT modality** — axe cannot show this |
| **marked, and NVDA announces nothing** | **only this tool** — author supplied data the AT cannot present |
| `lang` present but invalid | axe's `valid-lang`; silence here corroborates |
| unmarked foreign passage | needs language detection — neither this tool nor axe |

**Only the last is undecidable, and the corpus pair happens to be exactly that one** — which is how the
over-generalisation happened. W3C is explicit that speech alone is not enough: *"Auditors cannot solely
rely on the spoken output from assistive technologies, but must verify whether or not changes in natural
language have been identified correctly in the underlying code or markup."* The DOM census carries
`documentLang`, `partLangs` and `partLangCount` and was deployed on 2026-09-04, so this tool now has both
halves of what that sentence asks for.

### The head still does not work, and that is a SEPARATE fact

§36 established that neither the screen reader nor a rule can accuse an UNMARKED passage. The remaining
possibility was a trained head, and the 29 corpus cases were built to feed one. **It does not work, and
the held-out set is what established that rather than an argument.**

The head fitted the corpus and then scored FOUR HELD-OUT LANGUAGES at 0.506, 0.513, 0.536 and 0.604
against a 0.979 cut — eight false negatives, every one a page whose only novelty is being Dutch,
Portuguese, Polish or Norwegian rather than French, German, Italian or Spanish. So what it learned was
the corpus's four language NAMES.

**The asymmetry is the finding, and it is `3.3.2:placeholder-only`'s exactly.** The corpus can express the
property because it KNOWS what it wrote; the screen reader cannot hear it. On the failing page NVDA reads
French with an English voice and says nothing about it — the evidence of the failure is an ABSENCE, and a
head detects a positive pattern in an announcement. There is no announcement to detect.

**Choosing different languages for the held-out set is what made it visible.** Reusing the corpus's four
would have measured memorisation, reported it as generalisation, and passed. That is the whole purpose of
a held-out set doing its job, and it is worth noting it only worked because the acceptance matrix was
being written from scratch — `acceptance-covers-the-corpus.test.ts` now pins that it exists at all.

`3.1.2:language-unmarked` is therefore `decidedBy: "unavailable"` and in `MODEL_EXCLUDED_SUBTYPES`, which
keeps "nobody decides this" VISIBLE rather than letting the criterion read as covered. **The 29 corpus
cases stay**: they are ground truth for a future join against a DOM language census, and they are what
proved `[speech] reportLanguage` puts the language into the transcript at all.

### THAT CASE WOULD HAVE BEEN A DUD, and finding out cost one search rather than a capture

The design above was *"a passage carrying a `lang` NVDA cannot voice"*, on the assumption that an
unvoiceable marking is a SILENT one. **It is not.** From NVDA's own `configSpec.py`, on the release we
run and on master:

```
[speech]
autoLanguageSwitching     = boolean(default=true)
autoDialectSwitching      = boolean(default=false)
reportLanguage            = boolean(default=false)     <- we turn this ON; see CAPTURE_SETTINGS
reportNotSupportedLanguage = option("speech", "beep", "off", default="speech")
```

`reportNotSupportedLanguage` defaults to **`"speech"`** — so when NVDA switches to a language the
synthesiser cannot voice, it SAYS SO. The bad page would have announced, the pair would not have
discriminated, and `check-signals` would have reported it CONTAMINATED after a capture run. That is the
`reportEmphasis` shape exactly: a case built on an assumed screen-reader behaviour, refuted by reading
the vendor rather than by paying for evidence.

**Three consequences, and two of them are better news than the case would have been.**

- **The finding §36 wants is reachable from SPEECH ALONE, and needs no census.** If NVDA announces the
  unsupported switch, then "the page marks a passage and the user gets nothing useful from it" is a
  phrase in the transcript, not a join between the DOM and silence. That is a cheaper rule and a sounder
  one — it reads what the screen reader SAID rather than inferring from what it did not.
- **The census-based rule I declined to write would have been WRONG on a very common real pattern.**
  `autoDialectSwitching` is `false` by default, so `lang="en-GB"` inside an `en` document produces NO
  announcement at all — and `partLangCount > 0` with nothing announced is precisely the condition that
  rule would have fired on. A conformant page, accused. Three times in this project a rule was nearly
  shipped that would pass the corpus gate and fail on real pages; this is the fourth, caught before the
  first line.
- **`reportNotSupportedLanguage` IS A CACHE-KEY INPUT and is not pinned.** It changes what NVDA says, so
  by the rule in CLAUDE.md it belongs in `CAPTURE_SETTINGS` beside `reportLanguage`. It is at its default
  on every box today, so the corpus is consistent — but nothing would SEE it drift, because
  `fleet-consistency` only compares the digest of settings we pin. **Deliberately not added now**: the
  digest is a cache key and the fleet is 31% through a recapture, so adding it would throw ~9 hours away.
  It belongs in the next deliberate key change. So does `autoLanguageSwitching`, which is the precondition
  for `reportLanguage` doing anything at all — with it off, the setting we DO pin is inert, which is the
  same shape as `reportLanguage` shipping into the wrong ini section.

**What the case should be instead** is not yet decided, and deciding needs one capture: does NVDA's
unsupported-language announcement carry the language, a generic phrase, or a beep? Until that is measured
the pair's bad variant has no known signature, and a case whose signal is guessed is the one thing §17
refuses.


---

## 37. THE 3.5-HOUR STALL, DIAGNOSED — desktop preparation sat outside every guard — VERIFIED CURRENT 2026-09-05

**Confirmed against the artefact, not the prose.** `server.mjs` at HEAD has `prepareDesktopBounded(marks)`
called inside `runCapture`'s `try` block, ahead of `busy = false` in its `finally`; `DESKTOP_PREPARE_TIMEOUT_MS
= 60_000`; and its `.catch` logs, pushes a `desktopPrepareTimedOut` mark, and aborts the desktop-prepare
signal without rethrowing — every detail this section's own "The fix" describes, matching exactly. This
section was already correct and needed no rewrite; recorded here only because CLAUDE.md's rule about
proving a capture-path fix by its diagnostic mark rather than by a green result and a matching prose
description applies to auditing a doc the same way it applies to auditing code.

Open since 2026-09-02 and marked *"cannot be scheduled — it needs a recurrence."* It did not: the cause is
readable in `runCapture`, and reading it was cheaper than waiting for it to happen again.

**The symptom.** a11y-worker-6 held one capture for three and a half hours. `/health` answered throughout,
every readiness check green, `busy: true`, `current` still naming the case. From the run's side that is a
slow page, so it waited — and a corpus recapture made no progress at all.

**The cause, and it is one line's position.**

```
await prepareDesktop(marks);     <-- outside
try {
  const result = await captureWithLocalRecovery(...);   <-- the hard timeout is INSIDE this
} finally {
  busy = false;                  <-- and the release is inside the try
}
```

`busy` is released in the `finally`. The 520 s hard timeout wraps `captureWithNvda`, one level further
in. **Desktop preparation was outside both**, and it spawns PowerShell three times — dialog enumeration,
dismissal, and (since 2026-09-03) the foreground probe. This repo already records PowerShell taking 8 s
and then 25 s on a loaded guest. One that never returns leaves `busy` set for ever with no capture running
and nothing able to time it out.

It has been that way for as long as the function has existed — verified at `9c5973e`, where
`dismissBlockingDialogs` is line 20 and the `try` is line 28.

**Why it presents as a healthy worker.** Nothing is wrong. NVDA is fine, Edge is fine, the checks are
green, the HTTP server answers. The only visible symptom is a number that does not move, which is why
`fleet:status` showing the case and its elapsed time is what found it and why the readiness work of
2026-09-02 could not have.

### The fix, and why its bound is its own

`prepareDesktop` moves inside the `try` and gets a **60 s** bound of its own rather than the capture's
520 s. That number is sized for reading a page; preparation is three PowerShell calls that are
pathological past a few seconds, and a remedy taking eight minutes to give up still loses the run.

**A timeout there is RECORDED AND CONTINUED, never rethrown.** A desktop we could not tidy is not a reason
to refuse the capture: the dialogs it clears are usually absent, and the capture's own failure modes are
better diagnosed than a refusal here. `desktopPrepareTimedOut` separates *preparation was skipped* from
*preparation found nothing* — this repo's oldest distinction, and the reason the mark exists rather than a
silent `catch`.

**What this does not claim.** That a hung PowerShell call was the specific cause on the day. Nobody
captured the process state, and the worker was recovered before anyone could. What is established is that
the window existed, that it is unbounded, and that everything else in that function is guarded — so the
next occurrence is now bounded at 60 s and leaves a mark saying so.


---

## 38. 4.1.2's SETTABILITY clause cannot be assessed by this tool, structurally, and this is the first time it is stated

**Added 2026-09-05, auditing this file rather than fixing new code.** 4.1.2 Name, Role, Value has three
clauses. Two are covered and were already known to be: the name/role clause (rules-owned, exact on 147
records) and the state-change-notification clause (`state-change-silent`, rules-owned since ADR 0021,
measured 69/0/0 across 144 captures). The SECOND clause — *"states, properties, and values that can be
set by the user can be programmatically set"* — is covered by neither layer, and this file never said so
even though `docs/coverage.md` and `packages/judge/src/criterion-coverage.ts`'s own note for 4.1.2 have
said it plainly since a fix on 2026-09-05 (`criterion-coverage.test.ts`'s "4.1.2's note accounts for all
THREE clauses, including the settable one").

**Why it cannot be reached from here, and it is structural rather than a corpus gap.** Settability asks
whether an assistive technology can programmatically SET a value the user can set — a question about the
UIA/IA2 automation surface (a `ValuePattern`, a `TogglePattern`), not about anything NVDA says. This
project's capture drives NVDA, which operates controls by EMULATING THE KEYBOARD (`probeArrows`,
`probeTyping`), so it witnesses OPERABILITY, not SETTABILITY. A control the AT cannot set presents, in
speech, as one that does not respond to a keystroke — which is 2.1.1's failure and is indistinguishable
from it. No new corpus case closes this; the two failure modes produce identical evidence in the one
channel this tool has.

**What would tell you it is fixed:** nothing this tool can run — closing it needs a second capture
mechanism that drives the UIA/IA2 tree directly rather than emulating a keyboard, which is a different
instrument, not a corpus addition. Declared `unavailable` in the sense CLAUDE.md's own top table uses for
`3.1.2:language-unmarked` and `2.1.4`: a capability bound, recorded so a reader does not assume screen-reader
evidence answers a question it structurally cannot.

**Why this belongs here and not only in `coverage.md`/the code comment.** This file's whole premise is that
"all gates pass" and "everything is validated" are different claims, and a settability finding is exactly
the shape that never fails a gate — no rule, no head, no test claims to decide it, so nothing here was ever
red about it. A reader checking known-gaps.md for what this tool cannot do would not have found this one.

## 39. 2.4.7's F55 lower bound is unverified, because no capture has ever recorded a real script `blur()`

**CLOSED 2026-09-06, and the answer was sharper than "measure where 50ms sits".** The protocol-15
recapture this section was waiting on ran, and `rules:gate` promptly found the OPPOSITE problem from the
one this gap anticipated: not a threshold sitting too close to a real positive, but a threshold-based
predicate silencing 10 conformant records while catching 0 of 9 real positives — the 2.4.3 deafness trap,
on the exact rule this gap was tracking.

**The real measured positive, from `focus-removed-on-receipt-order.bad`'s captured 27-event log:** the
skipped field (`id=1`, "Delivery instructions") never appears as a completed `focusin`→`focusout` pair at
all. It appears ONLY as an orphaned `focusout`, twice — the script intercepts focus so fast that the
browser's own `focusin` event never finishes dispatching before the `blur()` fires. That is a **stronger**
answer than "the gap is comfortably under 50 ms": there is no gap to measure, because there is no
completed receipt to measure it from. `FOCUS_SCRIPT_BLUR_WINDOW_MS` (capture-pure.mjs) could never have
seen this shape, at 50 ms or any other value — it looked for a pair to time, and a scripted-fast-enough
blur does not produce one.

**What actually shipped (agent/2-1-2-false-positives, superseding the threshold approach entirely for the
orphan case).** Two real captures — this bad page's 27-event log, and `keyboard-trap-modal-escape.good`'s
17-event log showing focus REDIRECTED to a different real control on receipt, which is F55's own text
explicitly excluding ("removes focus from the content ENTIRELY", every W3C example a destination-less
`.blur()`) — refuted a capture-time verdict in both directions on the same night. Per ADR 0021 ("captures
record, rules decide"), the worker (`capture-pure.mjs`) no longer judges anything: `focusEventVerdict` is a
passthrough reporting the whole bounded event log. `addFocusEventFindings` (`packages/judge/src/rules.ts`)
does the full analysis: an orphaned `focusout` (no preceding `focusin` for that id) is F55 unconditionally;
a COMPLETED pair is F55 only if held under `FOCUS_SCRIPT_WINDOW_MS = 50` (the renamed, relocated constant
— same value, now judging a held-time rather than gating a capture-time pairing) AND not redirected to a
different real control within that window. The 50 ms figure itself is unchanged and still carries the
original negative-side margin (24 real pairs, minimum 633 ms, 12.6×+ margin) — what closed is not the
number, it is recognising that a THIRD shape (the orphan) needed no threshold at all.

**What tells you this is still correct:** `rules.test.ts`'s orphan-first test suite (built directly from
the two real logs above, mutation-checked) and `rules:gate` reporting the rule's own positive count
alongside 0 false positives across the conformant corpus — printed, never silently assumed, per this
gap's own original warning against a rule going quiet by going blind.

**What would tell you it is fixed:** `rules:coverage` reports `2.4.7` as fired with real captured evidence
(not `NEVER FIRED ANYWHERE`), and a specific measured `blur()` latency is recorded beside
`FOCUS_SCRIPT_BLUR_WINDOW_MS` in the same way the negative-side margin already is.

### ANSWERED 2026-09-06 by the protocol-15 recapture — and the threshold was never the problem

This section asked what `2.4.7` would report once real evidence existed. It exists now, and the answer is
worse than the question anticipated. **The rule is wrong in BOTH directions at once:**

```
POSITIVES: 9 | with focusEvents evidence: 9 | CAUGHT by 2.4.7: 0
FALSE POSITIVES on conformant records: 10 of 10
```

All nine `focus-removed-on-receipt-*.bad` records now carry real evidence — `checked: true`, 13 to 27
events each — and every one reads `scriptRemovedFocus: []`. The probe ran, produced a log, and the
predicate found nothing on the pages built to demonstrate the failure. It fires instead on ten conformant
records it was never meant to touch.

**`FOCUS_SCRIPT_BLUR_WINDOW_MS = 50` is the wrong axis for both halves, so no value of it helps.** Read
from the event logs:

- **The false positives are focus TRAPS.** `keyboard-trap-modal-escape.good` flags `focusin id=0 "Full
  name" 3189 → focusout id=0 3189` (0 ms) — and `focusin id=1 "House number"` follows at 3190 ms. Focus
  went somewhere real, 1 ms later. W3C's F55 does not cover redirection at all: every example is a
  destination-less `.blur()` and the mechanism text says the practice "removes focus from the content
  **entirely**". A dialog claiming focus for its first field is not this failure.
- **The false negatives never form the pair the predicate looks for.** In
  `focus-removed-on-receipt-order.bad`, `focusout id=1 "Delivery instructions"` appears with **no
  `focusin`, ever, on either lap** — the script took focus and stripped it faster than a `focusin` could
  fire. The real F55 in this corpus is an ORPHANED `focusout`, and a predicate hunting short focusin→
  focusout pairs is structurally unable to see it.

So: **DESTINATION separates the false positives; a MISSING `focusin` identifies the true positives.**
Neither is a latency.

**WHY NO GATE CAUGHT THE SILENT HALF, which is the part worth generalising.** `rules:gate` scores
per-subtype from `rule-ownership.json`, and **`2.4.7` has no entry there** — 18 subtypes are declared and
it is not one of them. So the gate reported `18 of 18 ... EXACT` while never scoring 2.4.7's positives at
all. Its false POSITIVES surfaced only because the conformant-record check scans every finding regardless
of ownership. **A gate can see an undeclared rule's false positives and is structurally blind to its false
negatives.** `docs/backlog.md` predicted exactly this — *"Add it WITH the case, not after. This is the
`3.3.2` shape: a subtype whose ownership nobody recorded, found later by a gate that could not attribute
it"* — and the cases have existed since 2026-08-28.

**Checked, once, whether any other rule is in this position.** The `PENDING_CAPTURE` exemption list in
`evidence-fields.test.ts` names every field that reached no capture before protocol 15, and it is the
complete list of rules that had never run against real evidence. Three entries have ever existed:

| field | rule | caught its own positives? |
|---|---|---|
| `arrowNavigation` | `2.1.1:control-unreachable-by-keyboard` | **24/24 EXACT** |
| `typedFeedback` | `3.2.2:input-context-change` | **28/28 EXACT** |
| `interaction.focusEvents` | `2.4.7` — **undeclared** | **0 of 9** |

Only 2.4.7, and the reason is the missing declaration rather than anything about the probe.

**What would tell you it is fixed** (replacing the criterion above, which asked for a latency measurement
that is now known to be the wrong question): `rules:gate` reads 0 false positives across all 1,398
conformant records AND 2.4.7's nine positives are caught with the count printed — both halves, because
silencing the ten alone reads 0 FPs and 0 of 9 and is worth nothing. Plus a `2.4.7` entry in
`rule-ownership.json`, without which the second half cannot be measured at all.

## 40. THE CENSUS MEASURED THE WRONG DOCUMENT ON EVERY REAL PAGE, and it was TRUSTED rather than refused

**Found 2026-09-06. Same class as the mistargeting bug `94a286f` closed, arriving through a different
door: not a competing CDP target, but OUR OWN PROBE navigating the page away.**

### The proof

Two different pages, one identical census:

```
/components/details/   pageState  25 headings / 188 links   ->  domCensus  19 / 131
/components/radios/    pageState  36 headings / 324 links   ->  domCensus  19 / 131
```

Two documents cannot produce one census. Both captures show the cause one event earlier — the same link,
really followed:

```
routeChange  {activating: "View cookies, visited, link"}
routeChange  {found: true, titleChanged: true}
structureCensus / domCensus  {targetMatch: fallback, candidates: 1}
```

### The mechanism

`probeRouteChange` (2.4.2's probe, added `9cd9bc1`, 2026-08-22) runs LAST, on the argument in its own
comment: *"it is the only probe that can leave the page under measurement... Everything position-dependent
has finished by here, so navigating away costs nothing."* **True of the probes it was reasoning about.
False for the once-per-capture `structuralCensus`/`domCensus`, which `navigateByStructureThenAudit` runs
AFTER it.**

`choosePageTarget` is NOT the bug — it correctly reports `fallback`, because the tab genuinely no longer
matches the expected URL. The failure is that **`censusTargetIsSuspect` treats `candidates <= 1` as
unconditionally safe** (*"nothing else this fallback COULD have picked; the only target is the right
one"*). That invariant holds for a competing target and does not hold for a lone target that has since
moved. So this shape is not among the captures the gate refuses — **it is silently accepted.**

`structureCrossCheck` even reports the disagreement (`heading 11 vs 4, link 129 vs 12`) and attributes it
to sweep incompleteness, having no vocabulary for "wrong document".

### Scope, MEASURED both sides

| | affected | of | note |
|---|---|---|---|
| **real pages** | **20** | 20 sampled of 49 | **100%, zero exceptions** — GOV.UK Design System, W3C's own WAI demos and tutorials alike |
| **synthetic corpus** | **25** | 2,796 | every one a `route-title-stale*` variant — the 2.4.2 family, whose whole purpose is to navigate |

The other 77 records carrying `interaction.routeChange` did not navigate (no `found`, no title change), so
their census was taken on the page under test and is sound.

### Did any verdict depend on the wrong census? NO, and here is the check

`ruleFindings` run over all 25 suspect synthetic records: **0 produced any rule finding.** Their censuses
are non-zero (`heading: 2`, `heading: 6`) so `1.3.1:no-headings` — which requires `census.heading === 0` —
could not fire, and `graphicUnnamed: 0` so the census-based 1.1.1 rule could not fire either. None of the
25 is a case whose criterion reads the census; they are all 2.4.2. **So on the synthetic side the wrong
evidence was harmless, by luck rather than by design.**

**The real-page side has no equivalent all-clear**, and that is the honest statement: census-reading rules
are `1.3.1:no-headings` and the census branch of 1.1.1 (`graphicUnnamed`), and on real pages they have been
reading a document other than the one requested since the navigation probe landed on 2026-08-22. Any
real-page number quoted from those rules since then rests on that.

### What would tell you it is fixed

The census is taken BEFORE any navigating probe, and describes the document the sweeps swept — same
target, same URL — with the mark recording the URL it was taken at and, for any fallback, the REASON in
words rather than the bare token `fallback`. Proven two ways: post-fix the two GOV.UK captures' censuses
land within the sweep's own margin of `pageState` (25/188 and 36/324) **and differ from each other**; and
with the order fix reverted, the trust rule refuses with `null` and a reason naming the moved URL rather
than trusting 19/131.

## 41. A GET FORM SUBMIT CHANGES THE URL, so the census trust rule refuses 18 of 2,796 records

**Found 2026-09-06 while reading a fallback's reason for an unrelated investigation.** Small, bounded,
conservative, and recorded here rather than fixed because the cost of getting it wrong runs the other way.

### What happens

`probeForms` submits. A form whose method is GET reloads the same page with a query string, and the URL
the capture navigated to is no longer the URL the CDP target reports:

```
expected: http://.../focus-removed-on-receipt-order/bad.html
actual  : http://.../focus-removed-on-receipt-order/bad?first=&second=&third=
```

`sameDocument` says those are different documents, so `choosePageTarget` returns `targetMatch: "fallback"`,
and `censusSuspectReason` treats **every** fallback as suspect. `pageCensus` then returns `null` and every
census-reading rule goes silent on that capture.

### The scale, MEASURED, not estimated

`rules:gate` on the current export: **2,778 of 2,796 records carry a census** — so 18 do not, 0.6%. And
`census.heading === 0 on 29 record(s)` is intact, so `1.3.1:no-headings` — the criterion that depends
entirely on a census confirming an absence — loses nothing. This was checked before deciding not to act,
because "small" and "small and harmless" are different claims.

### Why it is not fixed

The refusal is in the safe direction: a refused census reads as ABSENT, which every reader already treats
as "cannot say", so the failure mode is a rule staying silent rather than a rule accusing on another
document's numbers. Widening `sameDocument` to ignore a query string is not obviously right either — a
query string is exactly how a search results page differs from a search form, and those ARE different
documents for everything this project measures. The nine `focus-removed-on-receipt-*` captures are the
population that hits it, and their findings come from `focusEvents`, not from the census.

### What would tell you it is fixed

`choosePageTarget` distinguishes "the URL moved because our own probe submitted a form" from "the URL moved
because we are looking at another document" — which needs the capture to record that it submitted, and
`interaction.formChanges` already does. Then: the 18 carry a census, `2796 of 2796`, with no change to
`census.heading === 0 on 29` and no new finding on any conformant record.

### What would tell you it got WORSE

The count moving. It is printed by `rules:gate` on every run (`N of M record(s) carry ruleEvidence; K carry
a census`), which is the only reason this was findable at all — the same argument as every other number in
this file: state it, and a drift becomes visible instead of inferable.

## 42. PARTIAL — 2.4.7 cannot see an F55 on whatever element held focus when the listener was installed

**Created by a fix, deliberately, 2026-09-06.** Recorded the same day as the change that caused it, because
a limitation a commit introduces is the one most likely to be forgotten by the person who introduced it.

### What is not covered

`focusLossEvidence` reads an ORPHANED focusout — one with no matching focusin — as F55. That is right
everywhere except the log's FIRST event: the focus listener is installed after the page has loaded, so
whatever already holds focus received it before anything was watching, and an ordinary Tab away from it
produces a focusout with no focusin. `log[0]` is therefore excluded.

**A genuine F55 on that same element is excluded with it.** The two are byte-identical in this log and
nothing in the evidence separates them.

### Why it is the right trade, with the numbers

```
37 of 37 conformant real pages reported for 2.4.7  ->  their ONLY orphan was log[0], every time
9 of 9 corpus positives                            ->  log[0] is a focusin; orphans at index 2 and 9-23
```

So the exclusion costs nothing measurable and removes 37 accusations against pages whose publishers declare
them conformant. One unobservable failure on one element against 37 wrong claims is not a close call. It is
still a trade rather than a fix, which is why it is here and not only in the commit message.

### What would close it

Install the focus listener BEFORE the page has any focused element — before `openPage` commits, or on a
`document.readyState` earlier than the probe currently runs at — so the log's first event is a focusin and
`log[0]` stops being special. That is a capture-path change: it moves what the evidence CONTAINS, so it
costs a recapture and `evidence:check` has to say whether it moved anything else.

### What would tell you it is closed

`log[0].type === "focusin"` on every capture carrying a focus-event log, and the `i === 0` exception
deleted rather than kept alongside — with `rules:gate` still at 9/9 on `2.4.7:focus-removed-on-receipt` and
`rules:real-pages` still reporting no new 2.4.7 finding on a conformant page.

### What would tell you it got WORSE

`capture-probes.mjs` cutting the focus log from the HEAD rather than the tail. It currently uses
`slice(0, FOCUS_EVENT_LOG_DIAGNOSTIC_LIMIT)`, so the first event is always the first the listener saw. A
head-drop would make `log[0]` an arbitrary event and the exception would start hiding real findings at
unpredictable positions. That dependency is stated at the code too, not only here.
