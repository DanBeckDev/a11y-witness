# Known gaps

What this project does **not** currently do, or does not yet know. Written 2026-08-27, when all seven
gates passed together for the first time and a model shipped.

**This exists because "all gates pass" and "everything is validated" are different claims.** The gates
pass. Everything below is true at the same time, and none of it is hidden in a comment somewhere — each
entry names what is missing, what it would cost, and what would tell you it is fixed.

---

> **THIS FILE IS NOW THE RECORD, NOT THE TRACKER.** Every item below was worked and closed on
> 2026-08-27, and it is kept because *what a defect cost* is the part that stops it recurring — this
> repo's oldest habit. The list to work through is **[`reliability-plan.md`](./reliability-plan.md)**,
> which carries what is still open, scored against two published rubrics rather than against my opinion.

## The order these should be done in

Not by size, and **not** by what is closest to finished. By what CONSUMES what.

An earlier draft of this file put the retrain first, because it is nearly free and the model is only one
revision behind. That is the wrong order and it is worth saying why: **training consumes the corpus, and
the corpus consumes the capture path.** Retrain first and you retrain again after every item below it.
The same logic puts publishing last — a changeset describes weights, so it should describe the final ones.

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

## 3. `.mjs` typechecking — MOVED to [`reliability-plan.md` D3](./reliability-plan.md)

This entry said **46 of 102** while the tracker said **51 of 105**, and both were written by me on the same
day. One fact in two places, drifted — which is this repo's most-named defect, committed inside the
document that records it.

The remedy is the one it always is: delete the copy. D3 carries the count, the measured breakdown of the
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

**A candidate remedy, untested:** an `<input tabindex="-1">` with no label is an unnamed form field in the
accessibility tree and never enters the tab order, so a focus-safe variant of `bare-edit` might supply the
feature without perturbing the channel. Whether NVDA's form-field quick-nav still reaches it is the
question, and `--pipeline=verify --only=` answers it in minutes. Not attempted here.

Recorded in the shortcuts baseline rather than left refusing, because that baseline exists to detect
REGRESSIONS after a deliberate corpus change and these were diagnosed rather than assumed — but the
limitation above is the honest characteristic, and it belongs in this document rather than only in a
JSON file.

## 10. Publishing — MOVED to [`reliability-plan.md` D4](./reliability-plan.md)

Same reason as §3: a changeset count restated here goes stale the moment one is added, and one was. D4
carries the live state and the reason the last step is a human's.

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
