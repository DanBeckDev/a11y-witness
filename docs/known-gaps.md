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

## 12. CI on `main` is RED, and the fix is on this branch, unmerged

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

## 18. `dedupeKey` strips ONE container prefix, so a nested landmark is recorded twice

**MUST RIDE THE NEXT `CAPTURE_PROTOCOL_VERSION` BUMP.** This is the only entry here whose fix is written
and deliberately not applied, so it is the one most likely to be lost.

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

## 19. 69 cases are labelled `1.3.1:unassociated-table` and none captures a table cell

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

**The fix, and why it is not applied.** Let an accompanying defect declare the probes its evidence needs
(`probes: { probeTables: true }`) and union them in `withAccompanyingDefects`. Written and reverted: the
probe set is part of the capture options and therefore the cache key, so it recaptures **138 captures** to
change a field nothing reads. *"Check the premise before re-running the expensive thing."* Do it when the
rule is written, in the same change, so the recapture buys something.

**What tells you it is fixed:** every `+also-position-only-table` case carries `probeTables: true`, and
`structure.tableCells` is non-empty on their bad variants.

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
