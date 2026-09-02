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

## 21. `4.1.3` has NO real-page grounding, and closing it is a CONSENT decision rather than a code one

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

`scorer:shortcuts` reports free vetoes on the three focus subtypes, all on the same feature:

```
2.1.1:control-unreachable-by-keyboard   8 positives  10 vetoes  form_field_unnamed (-4.60)
2.1.2:focus-trapped                     8            10         form_field_unnamed (-6.59)
2.4.3:focus-order-scrambled             7            10         form_field_unnamed (-6.59)
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

**What is NOT established is whether it WORKED**, and that cannot be answered from a laptop:
`npm run scorer:shortcuts` refuses here — *"1868 of 1868 record(s) carry no `parsed` block … this copy of
runs/ predates the parse"* — which is the guard behaving correctly rather than a failure. The
authoritative answer is `npm run lab:job -- -e job=shortcuts`, and the question it settles is whether
`form_field_unnamed` is still a free veto on the three focus heads.

Recorded in the shortcuts baseline rather than left refusing, because that baseline exists to detect
REGRESSIONS after a deliberate corpus change and these were diagnosed rather than assumed — but the
limitation above is the honest characteristic, and it belongs in this document rather than only in a
JSON file.

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
