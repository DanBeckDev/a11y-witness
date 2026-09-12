# Operational Lessons

Cross-cutting diagnostic and process lessons moved out of CLAUDE.md during the #458 split — not fleet-specific or NVDA-specific, but general "how a wrong turn happened and what fixed it" incidents this repo has paid for.

## The diagnostics lied to me six times in one day, and never once by being wrong

Every one of these was a CORRECT value read from the wrong place, or a stale value read as current. None
of them looked like an error, which is why each cost a run or more.

| what I read | what it actually was |
|---|---|
| `journalctl -u <unit> --since <ExecMainStartTimestamp>` | the PREVIOUS run's window once the unit has exited — a stale `RULES: FAIL` for a gate that passes. **Three times.** |
| `ansible-playbook ... \| tail` | the pipeline's status is `tail`'s. A real `ANSIBLE_EXIT=2` read as success. **Twice.** |
| "the fixture capture keeps failing" | it had succeeded 20 minutes earlier; I was reading a later, unrelated refused job |
| "the rule does not fire on its fixture" | the fixture page demonstrated a DIFFERENT criterion, declared as such thirty lines away |
| "4 blockers, expect 1" | quoted from a run that predated three fixes |
| coverage counts mid-recapture | the corpus was being rewritten underneath the count |
| `capture-progress.json` said `running: false, 49 of 49` | the FINISHED run's file. A second run had started one minute earlier and not yet written its own — so I deployed into it and killed 12 captures. `lab:status` was printing `SubState=running` in the same output |
| the PLAY RECAP above a deploy's refusal | the PREVIOUS deploy's, seven minutes old. `followUnit` ran `journalctl -u <unit>` with no bound, so a correct refusal (`failed=1`, `changed=0`) read as a successful deploy. **The fourth instance of the journal-window defect**, in the one place that had no window at all |
| "which of my peers started that job?" | **me.** A backgrounded chain of mine was still running. I asked two other sessions before running `tail` on my own task output |
| `Error: Command failed: gh pr create --title revert: "Board record ..." broke main --body Reverts the merge of #562 ...` | an **argv** call, correctly quoted. Node renders an `execFileSync` failure by JOINING argv with spaces, so a title holding `"` and a multi-line body print inline and unescaped — a well-formed argv call and a broken shell string are indistinguishable in that message. The real cause was three lines further down and had nothing to do with quoting: `GitHub Actions is not permitted to create or approve pull requests`, a repository setting that blocks `GITHUB_TOKEN` regardless of the workflow's `permissions:` block. **Read to the end of the error before diagnosing its first line** |

**The rule that covers every row above: ask the authoritative source, and let it tell you what it is bounded to.**
The last three are the same rule pointed at three different sources, and the third is the sharpest — **your own backgrounded work is a source you have to ask too.** A chain you started an hour ago is
indistinguishable, from inside, from somebody else's job.

```bash
npm run lab:status -- -e job=<name>     # ONE run: systemd's view, the journal bounded by
                                        # InvocationID, and the run's own progress file
```

`lab-status.yml` has a task called *"Whether that journal is ONE run or the unit's whole history"*. It
existed the whole time. Every one of the three journal misreads came from hand-rolling `journalctl` instead
of running it — and improvising around a tool the repo already has is itself a defect source.

Two more that follow:

- **Never pipe a command whose exit status you intend to read.** `cmd > /tmp/log 2>&1; echo "EXIT=$?"` then
  read the file. `set -o pipefail` also works; a bare `| tail` does not.
  > **And then actually READ the echoed value — the remedy has the same trap inside it.** Appending
  > `; echo "EXIT=$?"` makes the COMPOUND command's status the echo's, which is always 0. Measured
  > 2026-08-25: the `gates` pipeline failed at stage 5 and the surrounding harness reported the run as
  > exit 0, because the shell's last statement had succeeded. The file said `PIPELINE_EXIT=2`. So the
  > echo is not a substitute for reading it, it is the only place the real status survives — and a
  > wrapper that reports the shell's status is the `| tail` defect wearing the recommended fix.
- **Check the premise before re-running the expensive thing.** Three capture runs went into "the 2.1.1
  fixture will not capture" before anyone asked whether that page demonstrates 2.1.1. It did not, and
  `real-page-corpus.test.ts` now answers that offline in milliseconds by pinning a fixture's declared
  criterion to the case it is built from. **The same discipline as "reproduce the fault with your test
  before trusting the test's verdict"**, applied to evidence rather than to a test.

**And the generalisation, which is this file's oldest lesson pointed at the operator instead of the code:**
a number is only as good as what it was computed from, so make every reported number carry that. The three
guards added on 2026-08-25 all do it — `rules:coverage` refuses a corpus written in the last ten minutes,
`run-job.yml` refuses a commit other than the one asked for, and the capture refuses a page whose URL is not
the one requested. Each replaces a plausible wrong answer with a refusal that names the cause.


### THE PRIMARY CHECKOUT IS READ-ONLY EXCEPT FAST-FORWARD

Ruled by `ceo`, twice, in messages — and a ruling that lives only in messages is not a rule, which is
exactly why it broke three times in one night: a worktree left parked on a branch, `lab:collect-promotion`
committing here because nothing marked the boundary between producing an artefact and committing it, and
a failed `cd` into a deleted merge worktree silently falling back here. None was carelessness — the rule
was known and written in a role file, and it broke anyway because nothing could REFUSE.

It matters mechanically, not territorially. `assertFleetRunsThisCheckout` hashes the WORKING TREE, so a
stray branch or a half-resolved merge here makes a capture run stamp itself against code that never
existed — best case a refused run, worst case one that passes and should not have. And a worktree's
`node_modules` may symlink to the primary's `dist`, so a branch parked here silently changes what every
OTHER agent compiles and tests against.

Two hooks enforce it now, both identifying the primary the same way `worktrees:prune` already does —
`.git` being a real directory, never a branch name or an absolute path:

- **`pre-commit`** refuses any commit made in the primary outright: *"this is the fleet-driving checkout;
  commit in a worktree."* Override with `A11Y_PRIMARY_COMMIT_REASON="<why>" git commit ...` — the reason is
  PRINTED, so a deliberate exception is in the log rather than in somebody's memory.
- **`post-checkout`** cannot veto a checkout that already happened (git gives it no such power), so it
  self-corrects: the instant a checkout in the primary lands on a branch, or detaches anywhere but
  `origin/main`, it immediately checks back out to detached `origin/main` and says why. Same override,
  `A11Y_PRIMARY_CHECKOUT_REASON="<why>"`.
- `npm run primary:update` is the only sanctioned way to move the primary forward — fetch, then detach at
  `origin/main`, nothing else.
- `lab:collect-promotion` writes its artefacts into whatever checkout it runs in, which is exactly how the
  second incident happened. It now detects the primary the same way and prints a copy-to-worktree step
  instead of `git commit` instructions that `pre-commit` would only refuse.
- Both hooks are mutation-checked by attempting the forbidden thing (`primary-checkout-guard.test.ts`) — a
  hook that has never been shown to refuse is not a verified hook, this repo's own rule, and the reason
  four guards fired on their own authors' first real trigger rather than on a test.


### And more than one agent may be DRIVEN by another — what worked, measured 2026-09-05

Three peer sessions worked units in their own worktrees while one session orchestrated and reviewed. It
worked, and the session running it had predicted it would not, so the reasons are worth having.

- **Every unit's acceptance test is named BEFORE the work starts, and it is a COMMAND, not a judgement.**
  A corpus hash identical either side of a 1,600-line move; a byte-comparison of comment-stripped source;
  a call graph proving four rules cannot be separated. The original sizing assumed each unit would be a
  subtle capture-path change where re-deriving the reasoning IS the review — this file's defect catalogue
  is full of those. Forcing a check instead is what made the throughput possible.
- **Partition by RESOURCE, never by topic or by file.** A worktree isolates the checkout and isolates
  NOTHING else: the fleet, the lab, the page server and `runs/` are single shared things, and this repo's
  guards turn a collision into a *silent wrong answer*. `lab:job` refuses a second job of a name rather
  than queueing it, and an agent reading that refusal as "already done" reports success for work that
  never ran. `fleet:deploy` reboots every worker. `assertFleetRunsThisCheckout` means the fleet runs ONE
  commit, so two worktrees on two commits means one of them is refused and which depends on who deployed
  last. **One driver for all of it.**
- **A fresh worktree has NO corpus** — `runs/` is gitignored — so `check-signals`, `rules:gate` and
  `verify.corpus.test.ts` all skip there. The pre-push hook does not run the first two at all since #911
  and says so unconditionally, which is honest and still means a delegated change gets a weaker gate than
  the main checkout's. Symlink `runs/` and `.venv` in, and
  run the corpus-dependent gates at merge time where they are real.
- **Do NOT drive the fleet and review diffs at the same time.** That is how a progress file describing a
  FINISHED run was read while a new one was a minute old — see the diagnostics table above; it cost 12
  in-flight captures. If there are enough hands, the useful split is LATERAL: one agent owning fleet-and-lab
  operations end to end, one owning review and merge. Not a hierarchy — review quality does not compose,
  because each layer holds less of the system and this repo's defects are precisely the ones that pass
  every mechanical check.
- **Ask HOW a number was obtained, not just whether it is right.** *"Was that measured or inferred?"* got an
  honest answer and a usable lesson where *"that is wrong"* would have got a correction and nothing else.
  A plausible number from a peer is the same hazard as a plausible number from a tool.


### A FACT STATED TWICE, and the copies drifted — five of these in one day

The section below is about a remedy reaching one of several paths. This is its sibling and it cost more on
2026-08-22: one fact written down in two or more places, where nothing compared them. Every instance was
silent, and three were found only because something unrelated failed.

| the fact | the copies | what it looked like |
|---|---|---|
| which probe a case wants | **six** hand-written hops: `pair()`, the manifest, the host runner, `server.mjs`, `capture-core`, and `evidence-check` | the probe never ran; the field it writes was simply absent, which is what a page with nothing to report looks like |
| what an announcement's accessible NAME is | `namesOf` (case-matrix.mjs) and `comparableNames` (rules.ts) | `check-signals` said CONTAMINATED — the signal firing on the conformant page while the rule stayed silent on the same capture |
| which rules ship | `rules.ts` source and `packages/judge/dist/rules.js` | `rules:gate` scored a rule the compiled bundle did not contain and reported `0/1 MISSING EVIDENCE` |
| which signal types exist | the `if`-chain in `signalMatches` and a REGEX in `acceptance-matrix.test.ts` that scraped it | the scrape matched nothing after a refactor, so the test asserted over an empty set — and passed |
| a case's page furniture | `withRealisticScale` keyed it on ARRAY POSITION — **fixed 2026-08-22**, it is now an FNV-1a hash of the case ID | inserting a case re-sized every case after it; `check-signals` reported `1 stale` |

**The fix is never "be careful", it is to make the copies unable to disagree.** In order of preference:

1. **Delete a copy.** `SIGNAL_TYPES` is now exported as a value, so the test reads the list instead of
   scraping the source it is testing.
2. **Derive one from the other.** The probe hops forward every `probe*` key by PREFIX rather than by name.
3. **Pin them equal with a test** when the duplication is forced. `namesOf` cannot import TypeScript — the
   corpus generator runs under plain `node`, and making it depend on a build is how the stale `dist` above
   happened — so `name-normalisation.test.ts` asserts both reduce real announcements identically. It failed
   twice on its first run, on cases nobody had considered.

Two rules that fall out and are cheap to apply:

- **A test must not derive its expectations from source TEXT.** Both the signal-type scrape and an earlier
  `sweepLog` guard passed while examining nothing. Read an exported value, or assert against a fixture.
- **Inserting a case re-buckets that SUBTYPE's later cases** — and this entry has now said the opposite
  twice, which is the more useful lesson.
  It first said "APPEND, never insert", because furniture was keyed on array position. Then furniture
  moved to an FNV-1a hash of the case ID and it said "insert, reorder or delete freely", verified by
  adding 60 cases and watching zero existing pages move.
  **Both were true when written, and the second is now wrong.** Measured 2026-08-26: hashing the ID gives
  each case an INDEPENDENT 1-in-5 chance of the `namedField` bucket, so a seven-case subtype misses it
  entirely with probability 0.8⁷ = 0.21 — one subtype in five — and exactly one did. That is a free veto
  under ADR 0015, on a feature no positive of that subtype carries. Furniture is now DEALT within the
  subtype: case *k* gets bucket *(offset + k) % 5*, so every subtype with five or more cases sees all five
  by construction rather than by luck.
  The cost is real and is the trade: a case inserted mid-subtype re-buckets the ones after it, so its
  pages change and they recapture. `furniture-spread.test.ts` asserts the guarantee per FEATURE — an
  earlier version asserted "at least two shapes" and did NOT catch a revert to independent hashing,
  because random assignment produces two shapes most of the time; it just does not produce all of them.
  **A rule that asks a human to remember something is a rule that gets broken** — which is why the
  property is a test rather than this paragraph.


### Three criteria a static analyser structurally cannot reach

Added 2026-08-22, and they are the clearest statement so far of what this tool is for. Each is recorded as
PARTIAL in `criterion-coverage.ts`, naming which failure mode it covers and which it does not.

| | assessed | why markup cannot answer it |
|---|---|---|
| 2.4.1 | a skip link that is present and **inert** | a checker sees a link and a plausible `href` and passes it |
| 2.4.2 | the route changes and the **title does not** | the markup is valid at every instant; the failure is the TRANSITION |
| 2.4.3 | the tab order **contradicts the reading order** | the DOM has no reading order to contradict until something walks the page |

**Each one's scope was settled against the spec, and one of them changed as a result.** 2.4.1's note here used
to say "a skip link is the first focusable element and announces as one" — i.e. detect its absence. W3C's
Understanding page is explicit that a skip link is NOT required: headings alone satisfy it (H69), landmarks
alone satisfy it (ARIA11). Every corpus page has an `h1`, so that rule would have fired on conformant pages.
**Read the criterion before building the rule**, and prefer the mode no other layer can see.

Three measurement traps, all found by capturing rather than reasoning:

- **The tab order is a CYCLE.** Past the last control Tab returns to the first, so a faithful recording ends
  by repeating what it began with — and comparing it raw made the CONFORMANT variant differ from itself.
  Compare each control's first visit.
- **The focus probe truncates at 12 stops on every corpus page.** So "absent from `focusOrder`" almost never
  means "unreachable". 2.1.1 is positional for this reason: a control counts as unreachable only when
  something LATER in reading order was reached.
- **Silence is not the signal you want.** The stale-title page announced `"visited"` — the link's own state,
  which names nothing about where the user is. A rule keyed on "nothing was announced" would have stayed
  mute on the exact page it was written for.


### A fix applied at ONE call site when the behaviour reaches several

Three defects in this file share one shape, and it is worth naming so the next one is caught by pattern:

| the behaviour | where the remedy was | where it was missing |
|---|---|---|
| focus mode makes quick-nav keys type themselves | `anchorToTop`, before the post-submit re-read | every sweep after an activation — 353 captures |
| guidepup 0.31 throws on `start()` of a live NVDA | `startScreenReader`'s catch, which adopts it | `ensureSpeechChannel`'s restart, which called `startFreshWithRetry` directly |
| speech must be settled before a delta baseline is read | `waitForAnnouncement`, at the END of the delta | the START — late speech credited to the activation |

A fourth has the same shape read from one step further back: the remedy was reachable from the right path
and **its trigger was never set**. `refreshBrowseBuffer` rebuilds NVDA's browse-mode buffer after a reused
window is re-pointed — the buffer belongs to the WINDOW, so navigation alone does not rebuild it — and it
guards on `navigatedExistingWindow`, which nothing ever assigned `true`. So it returned early on every
capture ever taken. Then three `capture:check` runs passed and it would have been natural to call the fix
confirmed, by results it had no part in producing.

**Confirm a capture-path change by its diagnostic MARK, not by a green result and not by a matching
`/health.code`.** Both were present while the remedy was inert. `refreshBrowseBuffer` now marks
`browseBufferFresh` when it skips, so "did not need to refresh" and "never ran" can never again be the same
silence — the same rule as *unchecked is not clean*, applied to a remedy rather than to evidence.

Each remedy was correct, commented, and reachable from only one of the paths that needed it. In two of
the three cases the comment at the working call site **already described the behaviour**, so the knowledge
was present and the coverage was not.

The `ensureSpeechChannel` one is the most instructive because of how it presented: every capture returned
`500 {"error":"NVDA is already running","fault":null}` while `/health` reported `ready: true` with all
four checks green, `failures: 35` against `captures: 24`, and `gate:stability` degrading 5/5 → 3/5 → 0/5
on unchanged pages. That reads exactly like the pages going nondeterministic. **The bare message and the
null fault are what identified it**: `startScreenReader` prefixes its failures with `"nvda.start failed:"`
and attaches a fault code, so an error with neither cannot have come from there.

**When you find a screen-reader behaviour worth a comment, grep every path that can reach it.** Lint and
`tsc` cannot see this — it is `.mjs` and the paths are unrelated functions.


### A LIST OF FIELDS TO CHECK, and the one field with a different SHAPE

Found twice on 2026-08-29, in two tools, an hour apart. Both had a hand-written list of evidence fields
and both silently examined nothing for the one member that is an OBJECT rather than an array.

| the checker | what it walked | the field it could not see |
|---|---|---|
| `evidence:check` (`evidence-diff.mjs`) | `EVIDENCE_FIELDS`, via `Array.isArray(v) ? v.map(...) : []` | `interaction.routeChange` — and `postSubmitNames` was not even listed |
| `channelsPresent` (`criterion-coverage.ts`) | `INTERACTION_CHANNELS`, via `nonEmpty = Array.isArray(v) && v.length > 0` | `routeChange`, which is also absent from the array while being in the `EvidenceChannel` union |

`routeChange` is `{control, titleBefore, titleAfter, headingBefore, headingAfter}`, and it is **the whole
of 2.4.2's evidence** — the transition a static analyser structurally cannot reach. Measured on
`route-title-stale.good.json`, the fixture built to demonstrate 2.4.2: the capture carries the evidence and
`criteriaAssessableFrom` answered `BLOCKED: 2.4.2 -> routeChange`. On every capture ever taken.

Three rules, and the second is the one that is easy to get wrong:

- **Adding the field to the list is half the fix.** Both tools would then have *listed* `routeChange` while
  the reader still returned `[]` for it — coverage that looks real and examines nothing, which is worse
  than the omission, because the omission is at least visible in a diff.
- **A union and a parallel array cannot be checked by `tsc`**, because every member of a wider union is a
  valid element of a narrower array. `EvidenceChannel` gained `routeChange` and `INTERACTION_CHANNELS` did
  not, and the build stayed green. The remedy is to DERIVE the arrays from an exhaustive
  `Record<TheUnion, ...>`, which fails to compile until a new member is classified — verified by adding a
  fake channel and watching the build break. Classify rather than omit: `tabStops` is `"unclaimed"`, so
  "nothing needs this" and "somebody forgot" stay different states.
- **Check the list against what captures actually carry, in BOTH directions.** A field on disk that is
  neither compared nor explicitly excluded is a hole; a field in the list that no capture has is a phantom
  contributing nothing to a coverage count. `evidence-fields.test.ts` asserts both.

This is the `repeat-capture` lesson — *"compared ten fields and not `formChanges` or `postSubmitFields` …
the ones this fault lives in were not among them"* — reaching a third and fourth tool, and it is why the
guard now discovers the fields rather than trusting anyone's memory of them.


### A comment that names an ambiguity, above code that resolves it by assumption

The sharpest version of the pattern above, and it cost the most on the first real website this tool was aimed
at. Three examples, all found in one session:

| the comment said | the code did | measured cost |
|---|---|---|
| "an unchanged phrase is ambiguous between 'did not move' and 'moved to something announced the same way'" | stopped the sweep on the FIRST repeated phrase | **graphics 5 of 66** on a page with four identical avatar alts |
| (same function) "silence is unambiguous evidence of not moving" — true on an idle guest only | ended the sweep on one silent step | **headings 3 of 10**, no error anywhere |
| `beginsWithRole`: "a leading LANDMARK is context, not the control's own role … reported three conformant W3C pages as 4.1.2 failures" | stripped landmarks, not CONTAINERS | **a false 4.1.2 against a named button**, because every real nav bar is a list inside a landmark |

The fix is the same each time: find the signal that is NOT ambiguous. NVDA **announces** the end of a page —
"no next heading" — so `exhausted` is the sound terminus and both repetition and silence are guesses. A log
delta proves speech is new, so it proves movement. Prefer the screen reader's own answer over an inference
about its behaviour.

> **A number beats a word.** "Examination was INCOMPLETE" cannot tell you whether two links were missed or two
> hundred. `crossCheckStructure` had been computing exactly that comparison into a diagnostic every run, unread
> — the same shape as the 604 silent `sweepLog` crashes. The report now states `link 51/58, graphic 59/66`, and
> a residual gap between the sweep and the AX tree is a question about this tool, not a finding about the page.

**Guest sizing is measured, not assumed: the VMs had 2 of the host's 14 vCPUs.** Raising them to 6 took a real
marketing page from "abandoned at the 280 s hard timeout" to 2:33, and `example.com` from 90 s to 19 s. The
symptom of CPU starvation is that `/health` and `/progress` stop answering **while the port stays open** — a
memory-starved server is slow, a CPU-starved one is silent. `config.plist` → `System.CPUCount`; UTM caches
configs, so stop every guest and quit UTM before editing.


### Two blind spots let a 1-in-125 contaminant into the corpus

`gate:stability` reported every canary stable while one capture of `filter-status-silent/bad` recorded
`after: "Energy results, document"` instead of the empty delta that IS the finding. Two independent gaps,
both over the same field:

- **`repeat-capture` compared ten fields and not `formChanges` or `postSubmitFields`** — the two carrying
  interaction evidence. Ten fields watched, and the ones this fault lives in were not among them.
- **`repeat-capture` had no `--probe-forms` and no `--task`**, so it could not activate a control at all.
  Every canary exercised only the disclosure probe, which runs unconditionally; 3.3.1 and 4.1.3 were
  structurally unreachable.

Both are fixed, and the sixth canary is now the exact page the fault occurred on. Note the trap that
required refusing a flag combination: `--probe-forms` with no `--task` activates nothing, so it compares
an empty field five times and reports it stable — a count-based check in a new costume.


## A metric computed on data that shares the flaw cannot see the flaw

The most expensive thing learned on 2026-08-22, and it outranks every individual defect below because it
says which of our checks were ever capable of finding them.

The trained heads see 384 encoder dimensions of ONE announcement plus **29 document-level features of the
whole capture**. When a feature is 0 on every training positive of a subtype, the head may give it a large
negative weight at no cost — and no held-out split can punish it, because the split has the same structure.
Measured on the shipped weights: `4.1.2:unnamed-control` scored the byte-identical announcement
`"combo box, collapsed, QUICKMENU ---- greater"` at **0.924042** on two W3C pages and **0.452519** on a
third, because the third is 14 layout tables and `table_present` is worth −1.26 logits. Not one of the 147
training records carrying an unnamed form field has a table.

**225 such free vetoes across all 13 heads.** The one that matters most: `form_field_named` at −4.33 means
the scorer reports an unnamed control **only on a page where nothing is correctly named**, which describes
almost no real site. Held-out acceptance (58 TP / 0 FP / 0 FN), `npm run eval` and `rules:gate` are all
blind to this *by construction*. See `docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md`.

Two audits now ask the question, at the two times it can be asked:

```bash
npm run corpus:starvation      # the CASE DEFINITIONS: which features will be constant? No capture needed.
npm run scorer:shortcuts       # the TRAINED WEIGHTS: which did a head penalise for free? In release:gate.
```

- **The corpus-side one is the design tool.** The weights-side one arrives after a capture run, an export
  and a train — correct, and too late to steer anything.
- **The remedy is the corpus, never the weights.** A retrain on unchanged data reproduces the vetoes
  faithfully; they are a correct fit to what it was shown.
- **Furniture plateaus, for a definitional reason.** Conformant page furniture fixed 263 starved pairs down
  to 178. It cannot go further, because a feature that IS a failure — a vague link, an unnamed graphic, a
  position-only table cell — never appears on a conformant page. Below 178 needs pages that fail TWICE.
- **The abstention floor saved this from being a false clean**, without knowing why. The missed page is out
  of support at 0.6978, so the tool abstained rather than scoring it and returning "no findings" on a page
  its own publisher calls inaccessible. Do not lower the floor to make a recall number look better.

**Generalise it.** Before trusting any accuracy figure here, ask what would have to be true of the data for
that figure to be uninformative — and then check whether it is.


## The things 2026-08-24 cost, and none of them were the model

A day spent chasing "12 false accusations on GOV.UK" that the tool never made. Recorded in the order they
have to be understood, because each one hid the next.

### 1. THE NUMBER WE STEERED BY MEASURED SOMETHING THE PRODUCT DOES NOT DO

`calibrate-abstention.mjs` read `record.predictions` straight out of `score.py` and called every true one a
FALSE POSITIVE. The CLI routes findings through `criterionOutcomes`, where an unmapped model finding becomes
`cantTell`. So the whole real-page calibration — and ADR 0019's headline — described accusations that were
referrals. **Verified before changing anything: the identical finding scores `cantTell` unmapped and
`failed` when conformance-mapped.**

This is the third instance of one defect in this repo, and the pattern is now unmistakable:

- `JUDGE_BACKEND` defaulted to `codex` while the Action shipped `local` — *"a gate that does not exercise
  what ships is not a gate"*
- the abstention sweep scored raw predictions instead of the product path
- `npm run eval` resolved the SHIPPED artefact always, so a candidate's judge quality was unknowable until
  after promotion — a gate that cannot examine the thing being decided

**Before optimising any number, run the path a user runs and check the number is the one they would see.**

### 2. THE ANNOUNCEMENT ORDER DEPENDS ON HOW THE CARET GOT THERE

Measured over 300 captures, with no overlap whatsoever:

```
structure.*  (quick-nav sweeps)      name-first  884   role-first    0
transcript   (arrow read-through)    name-first    0   role-first  880
```

NVDA's `getPropertiesSpeech` appends name→role→states, and browse-mode arrow navigation reverses it for the
focused object (nvaccess/nvda#11102). Seven partial regexes across three languages each guessed at one
order. They are gone: `packages/evidence/src/announcement.ts` is the single grammar, told its channel rather
than inferring it, validated on **6,555 cross-channel comparisons at 0.08% disagreement**.

Container context also PERSISTS: NVDA announces a container once on entry and says nothing again until
`out of list`. Reading each line's own containers reports every item after the first as contextless.

### 3. THE CORPUS CANNOT EXPRESS WHAT REAL PAGES DO — four times in one day

ADR 0019's thesis, earning its keep. Each of these was invisible to every corpus gate and appeared only on
somebody else's site:

| what broke | why the corpus cannot hold it |
|---|---|
| "Details" as a component name | corpus uses vague words ONLY in the failing sense — 13 of 13 wordlist terms, 0 conformant occurrences |
| a named iframe (`"Radios example, frame"`) | no corpus page has an iframe |
| a link mid-list with no prefix of its own | corpus lists are short enough that the prefix lands on the same line |
| a search combo box unchanged after Enter | 69 conformant + 69 failing disclosures against SIX combo-box records |

`npm run corpus:starvation` now reports **word-sense monopoly** — a feature no CONFORMANT record carries, so
its presence is a free predictor. Split into "fix these" (a wordlist, so the word has another sense in
English) and "correct as they are" (the feature IS the failure).

### 4. A LESSON LEARNED AT ONE LAYER, REPEATED AT THE NEXT, AT FOUR TIMES THE COST

`screenreader_features.py` carries `TOGGLE_ROLE` and the comment explaining it: Enter is not a combo box's
activation, the evidence is *"identical to a broken disclosure's, character for character apart from the
role"*, and leaving it implicit cost **3 false positives**. The new state-change RULE reproduced the
identical bug and cost **12 wrong assertions** — while ADR 0021 was being written about remedies that reach
one layer and not the others.

**When a comment names a control-specific behaviour, grep every layer that decides on that control.**

### 5. A ZERO CANNOT VETO, so "A and not B" must be computed, never handed over as two features

The promotion gate refused the candidate on 2.4.4: **27 false positives, precision 0.841**, against a
shipped model at **1.000 with zero**. Scored every clean development record and grouped what fired:

```
CLEAN records firing 2.4.4: 23
    22  component-index          <- the conformant pages added that morning
     1  components-text
```

Those pages carry "Details" inside a peer index, added deliberately so the WORD would stop predicting the
failure. Their features:

```
vague_link_present         = 1.0     pushes the score UP
vague_link_without_context = 0.0     correct — the link HAS context
```

**The contextual feature computes perfectly and cannot help.** `0 x weight = 0`, so it pushes up when it is
1 and can never pull down when it is 0. A linear head only ADDS. So:

> **If a criterion needs "A and not B", compute the conjunction and give the head one feature. Handing it A
> and B separately works only if the model can multiply, and this one cannot.** The heads are
> `torch.nn.Linear(n, 1)` — 13 logistic regressions with 416 parameters against 3 to 224 positives each.

Two corollaries earned the same day:

- **A feature that answers a DIFFERENT criterion is a shortcut waiting to be taken.** `vague_link_present`
  asks 2.4.9's question (is the text alone vague — AAA, unreported here). The 2.4.4 head used it because it
  was the cheapest separator available. It is no longer a model input; the helper stays exported for when
  AAA ships.
- **A corpus fix that appears to make things worse may have worked.** Adding conformant pages carrying the
  word did not create the problem — it removed the shortcut's cover and exposed the head's dependence on
  it. `corpus:starvation`'s monopoly report predicts exactly this, and the right response is to fix the
  FEATURE, never to withdraw the pages.

**And this is what the promotion gate is for.** Held-out acceptance said 90/90, 0 FP, 0 FN. Grouped
development said precision 0.841 over 2,419 records. Both true: acceptance is 104 records and cannot resolve
a 1.4% false-positive rate. `npm run lab:job -- -e job=promote` runs the candidate gate where the weights
and the code both live, refuses on the candidate's own reports, and writes nothing when it refuses.

**CONFIRMED by the retrain, and it cost nothing.** Removing `vague_link_present` as a model input took
`2.4.4:regex` from **27 false positives to 0** (precision 0.841 → 1.000) and recall *rose*, 0.979 → 0.986.
`2.4.6:regex` cleared entirely in the same change, 0.836 → **1.000/1.000** — the same shortcut had been
suppressing it. A feature answering a different criterion's question is worth removing even when it looks
like free signal.

### 6. THE THRESHOLD IS SET BY THE SINGLE WORST NEGATIVE, so one record reads as a model regression

The retrain above also moved `3.3.1:validation-error-silent` from **15 missed findings to 24**, in a change
that dropped a LINK-TEXT feature. Every head reads the same shared feature vector so it was genuinely
re-fitted — but it reads validation messages, and losing nine findings to link text wanted explaining. The
obvious reading is that the head got worse. It is not what happened, and the two need opposite responses:
go and look at one record, versus retrain.

`choose_threshold` takes the **lowest cut reaching zero false positives** over ~1,200 negatives. So the
threshold is an *extreme order statistic* — pinned by the single highest-scoring conformant record — and
the grid is 0.05 steps. Recorded by `threshold_sweep`, which now writes the whole curve into the report:

```
   thr    TP   FP   FN   recall
   0.85   108    5   13   0.893
   0.90   105    1   16   0.868     <- ONE negative sits here
   0.95    97    0   24   0.802     <- so the cut jumps, and 8 findings go with it
```

The head separates 105 of 121 positives above 0.90 with a single negative up there. Nothing about it
weakened. **A blocker now names the next cut down and what rules it out** — one false positive there is a
record to go and read; forty means the head is genuinely weak and the threshold is doing its job.

Two things fall out, both measured on the same report:

- **`development.precision` is the constraint restated, not a measurement.** It is computed with the cut
  that was *chosen from those same out-of-fold scores* to have zero false positives, so 1.000 is guaranteed
  whenever calibration succeeds. Thirteen heads reading 1.000 is not thirteen pieces of evidence. The
  contrapositive is the useful half: **precision below 1.000 can only mean the fallback fired**, so that
  head has no clean cut anywhere and is not calibrated at all. `1.3.1:unassociated-table` reporting
  "2 false positives at threshold 0.5" reads like mild over-eagerness and means the opposite.
- **The fallback was the cut that accuses MOST.** It returned a fixed 0.5, which its own docstring called
  "a value nobody chose" — and reporting a bad default loudly is not fixing it. Measured on the three heads
  where calibration failed: `2.1.2:focus-trapped` 36 false positives at 0.5 against **4** at 0.95;
  `2.4.2:route-title-stale` 6 against **2** at 0.75 *at the same recall*, so 0.5 was strictly dominated;
  `1.3.1:unassociated-table` 2 against **1** at 0.55. It is now the fewest-false-positive cut, ties broken
  by recall, and it can never choose worse than 0.5 did because 0.5 is itself a candidate.

**A cliff worth watching.** Three heads now sit at **0.95, the top of the grid** — `3.3.1`,
`4.1.2:state-change-silent`, `4.1.3`. One more negative crossing 0.95 leaves them no valid cut at all, and
3.3.1's own sweep puts the fallback at 31 false positives. The gate would refuse it, but the head goes from
clean to unusable on one record.

**The root cause is unfixed and is a product decision, not a bug.** A hard zero-false-positive constraint
selected on the same data it is reported against is high-variance by construction. The principled
alternatives — a quantile criterion, or conformal risk control giving a *bounded* false-positive rate with a
finite-sample guarantee — all trade "zero on this corpus" for "bounded in expectation", which for a tool
that ASSERTS conformance failures is a decision about what the product promises. Not to be made silently.


## 2026-08-25: eleven false positives on real pages, and they were all ONE defect

Driven to zero on 86 conformant real pages. `2.1.1` went from **66% of pages to 0**, `2.4.3` from 71% to
6%, `4.1.2` on training pages from **56% to 3%**. Four of the eleven had been producing ASSERTIONS, and
three of those landed on **W3C's own accessibility tutorials** — the pages that teach the guidance.

**Every one was two things compared that describe different moments, or different alphabets.** That is the
same sentence as the 2026-08-24 section below, and it is worth writing twice because it kept being true.

| what was compared | and why they could not match |
|---|---|
| a COUNT sweep, read as an ordering | `collectByType` walks backwards from the caret then forwards, deduplicating. On `date-input` the caret fell between Month and Year, so a reconstruction placed them 17 entries apart where the page reads them adjacent. **The transcript is a read-through and is ordered by construction** — that is the only reading-order signal this tool has. |
| a toggle's name, before and after it was pressed | `"Expand Quick start"` becomes `"Collapse Quick start"`. `probeDisclosure` activates a control unconditionally, so the sweep can record BOTH labels while the focus probe only ever sees the second. |
| a page open for one probe, closed for another | sportengland's search panel was expanded for the sweep and collapsed for the focus probe. Controls inside a closed panel are not focusable, correctly. **A capture is not an instant.** |
| Tab against a widget that shares one tab stop | Native radio groups and ARIA's roving tabindex give a GROUP one stop, with arrows inside. The probe presses only Tab, so a capture cannot tell *reachable by arrows* from *unreachable*. |
| a name with an icon-font glyph against one without | **U+E604**, Private Use Area, in the focus channel and not the sweep — so `"Print this page"` never matched itself. `\s` does not match it and `trim()` does not remove it. The U+FFFC lesson in a second alphabet. |
| a name with `clickable` wedged into its container prefix | NVDA interleaves a STATE between containers: `"main landmark, clickable, form, clickable, Continue, button"`. The container loop stopped at the first one, so `"form Continue"` became a control name. |
| one element announced with TWO roles | `<button><img alt="Submit Search"></button>` is `"Submit Search, graphic, button"`. Parsed as a named graphic PLUS an unnamed button — and an empty name IS the 4.1.2 finding. |
| a container role used as a NAME | `"Menu, button"` is a button named Menu; `menu` is also a container role, so the name was stripped and the button reported unnamed. **The disambiguation is CASE** — NVDA lower-cases roles and passes names through as authored. |
| markup read aloud, against prose | `<input type="image" src="searchbutton.png">` is announced `"less input type equals image src equals searchbutton dot png"`. `isImage` matched the word *image* inside the markup. |

### The one that matters most: a rule can be clean because it has gone DEAF

The transcript rewrite took `2.4.3` from 71% of conformant pages to 6% — and caught **0 of the 4 corpus
records it owns**. NVDA WRAPS a field's label and role onto separate transcript lines:

```
"form, Full name"     <- the label, no role
"edit"                <- the role, no name
```

Requiring both on one line found nothing in the corpus. The real-page number looked excellent for the
worst possible reason, and it would have shipped.

**`rules:gate` refused it, and that is the whole point of the corpus.** It is free ground truth: 1,183
conformant records with 0 false positives, and every rule-owned subtype scored against real captured
evidence. **Run it after ANY change that makes a rule quieter.** Quieter is only good if it has not gone
deaf, and nothing on the real-page side can tell you which you got.

### Two process slips, recorded because they are cheap to avoid

- **A verdict was quoted from a journal window spanning two runs**, and the older one was read — a stale
  `RULES: FAIL` for a gate that passes. `journalctl --since "$(systemctl show -p ExecMainStartTimestamp
  --value <unit>)"` bounds it to the run you dispatched.
- **A commit went in with three tests failing**, because `npm test` was run and its result not read. The
  tests were right and caught a real over-broad fix.

### What is CORRECT and must not be "fixed"

18 findings remain on 86 conformant pages and every one was checked individually:

- **4 assertions, all real** — scotcourts' `<button class="inner mobileMenuButton">` with no text and no
  aria-label, networkrail's bare `"button"` and its silent state change.
- **8 referrals on combo boxes**, where NVDA announces the VALUE where a name would go, so *unnamed* and
  *named, value shown* are indistinguishable. Suppressing this was tried and lost three real corpus
  positives; `secondary` → `cantTell` is the tested answer.
- **5 real order differences** and **1 real filename-as-alt**.

A referral on a conformant page is not automatically a defect. **Check whether the evidence genuinely
shows the thing before making the tool quieter about it.**

### What was checked and REFUTED, so nobody re-derives it

**Bag size is not the driver.** The distribution shift is real and large — corpus median 18 / max 43 against
real median 253 / max 805, so the corpus maximum sits below the real 25th percentile — and padding 40
conformant pages with conformant content produced **0 accusations at every size across 200 trials**.
`npm run scorer:size-sensitivity` is kept because it is the only check that could see a size effect if a
future pooling change introduces one. An earlier 3/12 was an instrument fault: the donor pool moved with the
sample size, so two runs were two experiments.

### "The rule never fired" and "the rule never had its evidence" are different answers

`rules:coverage` reported `1.3.1 assessed 0 corpus 0 real — NEVER FIRED ANYWHERE — the claim rests on
nothing` for as long as that rule has existed, and that sentence sends you to the CORPUS. The fault was in
the exporter, and finding it took an audit that started by asking whether the rule was even reachable.

`addMissingHeadings` needs `census.heading === 0` — the AX tree CONFIRMING no headings, because a sweep
alone cannot tell "this page has none" from "we could not ask". Every capture records that census as a
`structureCensus` diagnostic, and `diagnostics` is correctly on the exporter's `FORBIDDEN_INPUT_KEYS` — so
the census never reached the exported record. Measured: `input.census` was `undefined` on all 3,790 of
them. `score-rules.ts` then scored `record.input`, the MODEL's allowlist, so **the gate could not exercise
ANY rule reading evidence the model is deliberately denied.**

**The product path was fine throughout** — the CLI builds `census: pageCensus(cap)` itself. So these rules
work where it matters and were unexercised where they are checked: *a gate that does not exercise what
ships is not a gate*, for the fourth time in this repo.

**A second rule was affected and was completely invisible.** The census-based 1.1.1 rule — images the tree
exposes with no accessible name, which NVDA's sweep walks straight past — is equally unreachable, but
sibling 1.1.1 rules DO fire, so the criterion read `validated on real evidence`. 1.3.1 at least announced
its own silence.

The split this needed was **already designed**, thirty lines above the leak guard: *"`modelInput()` is an
allowlist and FORBIDDEN_INPUT_KEYS names `dom` explicitly, so a rule may use evidence the model never
sees"*. It had never been implemented. `ruleEvidence` is now a SIBLING of `input` — the boundary assertion
and the featurizer both read `input`, so neither can reach it — and the gate merges the two.

**And the gate now STATES whether that evidence arrived**, because the ambiguity cost the investigation
twice: once to find, and once again when the re-export left every number unchanged and the report could not
say whether the census had arrived and found nothing or had not arrived at all.

```
# evidence the rules may see and the model may not
  2366 of 2366 record(s) carry ruleEvidence; 2366 carry a census
  census.heading === 0 on 0 record(s); census.graphicUnnamed > 0 on 155
```

That converted a guess into a fact: **the corpus contained no page with zero headings**, proved rather
than assumed, so the residual gap was a CORPUS gap and the remedy was a corpus page — not a change to the
rule. `page()` emitted an `<h1>` unconditionally, which is why: every generated page carried one by
construction and all 93 real captures are real sites.

**CLOSED 2026-08-26.** Five `1.3.1:no-headings` cases, and the rule now reads
`29/29 rules: EXACT` with `census.heading === 0 on 29 record(s)`, validated on a real page as well as the
corpus. Three things had to be true at once and each was found by measuring rather than reasoning:

| what was wrong | how it presented |
|---|---|
| the census was stripped at export, and TWO of three gates passed a RAW capture to `ruleFindings` | `rules:gate` said `29/29 EXACT` while `rules:coverage` said `fired 0x` — **two gates disagreeing about one corpus is the signal** |
| furniture and the `generic-heading` accompanying defect both put headings back | 5 of 29 variants silently carried one; the whole suite passed with them voided |
| three pages fell under `MIN_CONTENT_LINES`, so the rule read them as fragments | `rule-decided on 29 record(s) and caught only 26` — and two passing cases sat one block above the floor |

The census-based **1.1.1** rule was fixed by the same change and was the worse of the two, because sibling
1.1.1 rules fire: its criterion read `validated on real evidence` throughout. Its corpus evidence went
**350 → 734** once the census arrived, which is the size of what was invisible.


### A diagnostic that cannot report itself, six times in one evening

The 2026-08-22 table above is about a fact stated twice. This is its successor and it cost most of
2026-08-26: **the system was largely working, and every layer that could have said so was broken in a
way that made it look otherwise.** Each one was found only by disbelieving a message.

| what it said | what was true |
|---|---|
| `fleet:deploy`: "the files on the box are not the ones you think" | the FETCH had failed and reported success — PowerShell does not abort on a failed NATIVE command, and `changed_when: true` claimed a change regardless. One dirty file blocked every fast-forward, for every deploy |
| `UNREACHABLE` on one to four workers, four runs running | they were rebooting from the deploy BEFORE — `deploy.yml` reboots what it deploys to, and nothing waited. All five answered `/health` throughout |
| `lab:status -e job=capture-real-pages`: `captured: 29, total: 1431` | the DATASET run's file, for a FIFTY-page job. `training:status` reads `DATASET_ROOT`; the fix for the same bug on `acceptance` covered only `acceptance` |
| a Jinja traceback where a refusal should be | the guard had FIRED correctly — a capture was holding the checkout — and crashed writing its own sentence |
| `50 of 86 captures read the site's furniture` | MY metric, merging "has a cookie banner" (every UK gov site) with "never got past one" (one page) |
| `wrong-page` × 7, no detail | seven stale corpus URLs, and `captureFault(code, message)` called as `(message, code)` so the diagnostic went into `.code` and the bare code became the message |

**The rule that covers all six: when a diagnostic surprises you, suspect the diagnostic before the
system.** Every one of these was investigated as a fleet, corpus or capture fault first, and every one
was the reporting.

Three habits fall out, all cheap:

- **A guard must be able to say what it caught.** `regex_search(p, '\1')` throws INSIDE the filter on a
  non-match — Ansible calls `.group()` on the None — so no `| default` afterwards can save the message.
  `regex_findall` returns `[]`. A guard that stops the job and explains nothing gets distrusted, then
  bypassed: `A11Y_SKIP_VERIFY=1` was used **six times** in one evening for a `rules:gate` refusal that
  turned out to be a stale local export.
- **Escaping in YAML+Jinja is settled by RUNNING it, never by reading.** In a folded scalar `\.` matches
  nothing and `\.` written as `\.` in the file matches; `\b` inside a Jinja literal is a BACKSPACE.
  Both cost real time here. A three-line playbook answers it in ten seconds.
- **`changed_when: true` on a shell task is a lie waiting to happen.** It reports change without knowing,
  and on Windows the shell will not fail for you.


## The rule that cost the most to learn

**A check must never reject evidence whose absence is the finding.**

The worked example: `custom-control` bad pages are div-based fake buttons with no `<button>`, so NVDA
finds no form controls. That absence *is* the 4.1.2 failure the case demonstrates. A guard that
rejected captures whose requested probe produced nothing therefore threw away the evidence, failed 44
cases in a live run, and added hours to it — after being validated on six hand-picked cases, none of
them from that family.

Whether an empty probe is malfunction or evidence depends on the **case definition**, which
`check-signals` can see and the capture layer cannot. So gating belongs there, and it already reports
it better: BLIND when a signal cannot fire, CONTAMINATED when it fires on both variants.

**Prove it before you ship it.** `npm test` includes `verify.corpus.test.ts`, which runs every gating
predicate over every capture on disk and asserts none is rejected. The corpus is free ground truth —
`check-signals` scores it 1061/0/0, so a rejection is a false positive by construction. It runs in a
second. Six cases is an anecdote; 2,122 is a test.

### The mirror image: a probe that CRASHES also produces an empty field

The rule above is about not rejecting evidence that is legitimately absent. This is the same
indistinguishability read from the other end, and it cost a whole corpus.

`9cabfb4` ("the cost was anchorToTop, not the sweeps — 21% faster") added `ctx.trips.count` to
`collectByType` for per-sweep round-trip counts. Five call sites pass `{...ctx}` or spell out
`deadline, diag, trips`; the **postSubmit** one spelled out only `label, onItem, deadline`. So
`ctx.trips` was `undefined` and the function threw on its own first line — *before any sweep ran*.

The throw was caught. The catch was not empty: it recorded `postSubmit ERROR …` to
`interaction.sweepLog`, exactly as this repo's rules require. **Nothing read `sweepLog`.** Result:

- `postSubmitFields` came back `[]` on **all 2,122 captures**, 604 of them with a logged crash
- `validationErrorIsSilent` spent the entire corpus on `formChanges.after` — the fallback **its own
  comment calls useless**, because it reads `"<title>, document"` on both variants
- 6 cases could not discriminate, and the failure looked like a page problem, not a probe problem
- every other check stayed green: counts never moved, and an empty field is not a malformed one

Nothing existing could have caught it. `evidence:check` compares fields, and this field was empty in
both the before and the after. The eval fixtures that *do* show the probe working
(`filter-status-good.json`, `postSubmit: 3`) predate the regression, so no comparison ran against them.
This is the same class as the h1 announcement that vanished from 90 captures with every check green.

Three rules follow, and they are cheap:

1. **A caught-and-logged error is not a handled error.** If nothing asserts on the log, the log is a
   comment. `verify.corpus.test.ts` now fails on any `sweepLog` line containing `ERROR`, which turns
   604 silent crashes into one red test.
2. **When you add a required field to a shared helper's context, grep every call site.** Lint and
   `tsc` cannot see it — this is `.mjs` reading a duck-typed object, so the only signal was a runtime
   throw inside a `try`.
3. **A guard must be shown to fail before it is trusted.** The first version of that test read
   `capture.interaction.sweepLog`, which does not exist — sweepLog reaches the file only via the
   `interaction` *diagnostic mark*. It passed against the very corpus carrying 604 crashes. A test
   written against a shape you did not verify is the count-based check all over again.


## A CHECK WRITTEN AS A TEXT SEARCH CANNOT TELL THE GUARD FROM THE EXPLANATION OF THE GUARD

Three of these on 2026-09-12, found independently by two sessions, which is a shape rather than a
coincidence. **This repository writes very long explanations — that is deliberate and it is why the shape
recurs here more than it would elsewhere.** A comment naming the thing a check searches for satisfies the
check, and the check then reports on its own prose.

| where | what happened |
|---|---|
| #1002 | a leak-scan pin satisfied by a **commented-out tail** |
| #1001 | a gate assertion satisfied by prose about itself |
| #1022 | the row's own open-check, `grep -c 'Merge already in progress\|…' scripts/arm-pr.mjs`, went `0 → 1` **entirely because a JSDoc line quotes the error the fix is about**. The fix deliberately does not match GitHub's message text — keying on prose is what `merge-guard`'s `FAULT.*` rule exists to avoid — so nothing in the code could ever have satisfied it |

**It fails in BOTH directions and neither is loud.**

- *"Zero until fixed"*, met by a comment, reads as a fix that landed. That was #1022.
- *"Non-zero while open"*, met by a comment, can never reach zero, so **the row can never be shown closed**
  even after the work is done. That is the commoner half here, and the safer one, and it is still not a
  measurement.

**The population, measured 2026-09-12.** 60 open rows; 59 carry an `## Open-check`; **23 of those checks
are a text search over repo files.** Of the 13 targets that are source files rather than docs, each
pattern compared against the file raw and against the same file with comments blanked
(`local-import-closure.mjs`'s `stripComments`):

| | |
|---|---|
| satisfied by prose **alone** today | 0 |
| **satisfiable by prose** — the pattern also occurs in comments, so the count survives the code being removed | **4** |
| code-only, immune | 2 |
| no match either way (genuinely open) | 7 |

```
#32  real-page-corpus.mjs      12 matches raw,  3 in code  ->  9 in comments
#34  case-matrix.mjs           11 matches raw, 10 in code  ->  1 in comments
#34  criterion-coverage.ts      7 matches raw,  3 in code  ->  4 in comments
#852 row-claim.mjs              4 matches raw,  2 in code  ->  2 in comments
```

**That table is what was FOUND. All four were amended the same day** (#1027), and each amendment carries
its own measurement on its own row — so the remedy is the cheap half of this entry, not the expensive one.
**#32 is the whole argument in one row:** `grep -n 'forms' real-page-corpus.mjs` answered *"the word forms
appears in this file"*, which it always will, because most of the matches are URLs
(`.../tutorials/forms/labels/`). It now imports the module and asks whether any of the 109 shipped pages
carries a `probeForms` key. Same question, one that can actually change.

**And #34's check carried a wrong word that the grep could never have surfaced.** It read
`grep -n '2.4.6' criterion-coverage.ts # still partial`; that entry's `status` is `"assessed"` and has
never been `partial`. The row's substance was right — 2.4.6 covers headings while the criterion says
*headings AND labels* — but the overstatement lives in its `channels`, and anyone reading the check for
the row's condition would have gone looking for a field value that does not exist. **A text check cannot
be wrong about the field it does not read.**

**The rule: a check must read the behaviour, not the file.** In order of preference — call the function
and read its answer; read an exported value; count something only code can produce. `#968`'s
`grep -c '^export const OUT'` is the cheap correct form: `^export` is a shape a comment cannot have.
Searching a **prose** file for a sentence is fine and is not this defect — a `.md` has no code/comment
distinction to confuse.

**And the tell is specific: if the string you are searching for is also the string you would use to
EXPLAIN the thing, the check is about to read your explanation.** That is exactly when a codebase like
this one has already written it down nearby.

[#1027 carries the four amendments and the sweep.]

## A VACUITY GUARD THAT ASKS WHETHER **ANY** POPULATION WAS EXAMINED CANNOT REPORT THE EMPTY ONE

**2026-09-12, #1054.** A sibling of the entry above, and the sharper half of it: there the check read the
wrong THING; here it read the right things and combined them with the wrong word.

`row-reachability.mjs` answers two questions about a row — *is its subject on `main`* (symbols) and *is any
unmerged branch in its region* (paths). It guards against answering either one vacuously:

```js
function examinedNothing(row, examined) {
  if (examined.paths > 0 || examined.symbols > 0) return null;   // <- nothing to report
```

**That header says, in the file, *"reporting STARTABLE having examined nothing is the defect this repo
records most."*** And it could not see its own case. #907 declares its Region as three entries — `CLAUDE.md`,
`docs/` and `packages/lab/src/packaging/` — and named one backticked symbol. The path population came back
**zero**; the symbol population came back **one**; the disjunction returned `null`; and the verdict printed:

> `#907 is STARTABLE: every symbol it names is on main, and no unmerged branch is in its region (0 path(s),
> 1 symbol(s), 291 unmerged ref(s) examined).`

**The count that would have given it away is printed in the sentence that is wrong.** `0 path(s)` is right
there, next to a positive claim about the set it counts. `row-claim claim` refused the same row for
overlapping an open pull request in one of those three directories.

**The rule: a guard over N populations needs N answers.** A disjunction turns *"I examined nothing here"*
into *"I examined something somewhere"*, and the verdict then makes a claim per population from a guard
that made one claim in total. Each population's own emptiness is stated beside the verdict it belongs to —
`row-reachability` now says `its region was NOT examined` rather than `no unmerged branch is in its region`,
and the region count travels in the same line.

**The two constructions look alike and only one is the defect. Sweep for the right one.**

| shape | what it asks | verdict |
|---|---|---|
| `if (a.length > 0 \|\| b.length > 0) return null` | *did ANY population get examined* | the defect — one non-empty population certifies the other |
| `if (a.length === 0 && b.length === 0) return CLEAN` | *are both FINDINGS lists empty* | correct, and the commoner one |

**Measured across 292 files** (`scripts/*.mjs` and `packages/lab/src/packaging/*.test.ts`), three spellings
searched — the disjunction over examined counts, the conjunction over emptiness, and a summed total compared
to zero. **One instance of the defect** (`row-reachability.mjs:104`, fixed by #1054) and **three of the
correct construction** (`closes-mismatch-check.mjs`, `owned-path-signoff.mjs`, `ready-label-audit.mjs`),
which are about findings rather than populations and are right as they stand. **The sweep cannot see a
disjunction spelled across two separate `if`s**, which is the population it did not search rather than a
population that is empty.

**It is the guard version of [a check that observes something ADJACENT to the property](pipeline.md#a-check-that-observes-something-adjacent-to-the-property-is-the-failure-review-cannot-catch).** The number is real; the population it
describes sits next to the one the verdict is about. The tell is the same one that finds the rest of that
family: **read what the guard actually enumerated before believing what it concluded** — and when a verdict
makes two claims, check that the guard in front of it made two.

## A GUARD THAT ALREADY EXISTED, and a weaker check substituted for it

Three mistakes in one session on 2026-09-01/02, and only the first was a gap in this repo. The other two
are the same shape as `A11Y_SKIP_VERIFY=1` being reached for nine times in one day: **a check existed, and
I put my own judgement in front of it.**

| what happened | the guard that was already there |
|---|---|
| a backtick in a comment inside a PowerShell template literal, twice, ten minutes apart — `SyntaxError: Unexpected identifier`, with lint and tsc green both times | NOTHING. This one was a real gap and is now `mjs-parses.test.ts`, which this file had named as "the only real check" and never automated |
| 32 corpus messages validated OFFLINE against the page SOURCE and reported as correct — the predicate reads what NVDA **said**, and NVDA speaks "e.g." as "e dot g." | `check-signals` runs every signal against real CAPTURES and caught it as one CONTAMINATED case. I ran a weaker check first and believed it, so the real one became a surprise instead of a confirmation |
| a commit landed on a branch I then deleted, so a fix I had reported as "on main" was gone | `git branch -d` REFUSES an unmerged branch. I used `-D` |

**The rule: a cheap pre-check is for deciding whether to bother running the real one, never for concluding
the real one will pass.** Both offline checks above were reasonable and both examined the wrong thing —
the source text rather than the announcement, and my memory of what was merged rather than git's. Reported
as results, they made the authoritative check look like a regression when it disagreed.

And **prefer the refusing form of a command over the forcing one** when you are about to destroy something:
`git branch -d`, not `-D`. The forcing form exists for when you know better; used by default it converts a
guard into a formality.


## fleet:provision --serial=0, and the SRE Workbook

**`fleet:provision` runs the ROLE, and it must run across the WHOLE fleet.** `provisionRevision` is a hash
of four environment files and it is a CAPTURE CACHE KEY that `fleet-consistency` also treats as
MUST_MATCH — so a box provisioned alone gets a stamp its peers do not have, the fleet reads INCONSISTENT,
and every capture run refuses to start. `stamp-provision-revision.ps1` records that happening: four boxes,
four revisions, *"purely because each first-booted at a different commit during one afternoon"*. Use
`--limit` only to REPAIR a box back to the stamp its peers already carry, never to add one.

> **A GLOBAL ALL-AT-ONCE PUSH IS NORMALLY WRONG, AND HERE IT IS THE ONLY SAFE OPTION.** The SRE
> Workbook is explicit that a config change must be deployable gradually — *"avoid a global all-at-once
> push … doing so allows you to detect issues and abort a problematic push before causing a 100%
> outage"* — and `--serial=0` is exactly the push it warns against. It is still right here, for a reason
> specific to this fleet: `provisionRevision` is a capture cache key AND a `MUST_MATCH` field, so a
> canary box is not a safety measure, it IS the failure mode. One box provisioned ahead of its peers
> splits the fleet, `fleet-consistency` reads INCONSISTENT, and every capture run refuses to start.
> The rollback the book asks for is `git checkout <ref> && fleet:provision` across the whole fleet, and
> the "abort before 100%" it asks for is the pre-flight refusal of a worker mid-capture. Do not
> introduce staged provisioning here without first removing `provisionRevision` from the cache key,
> which would cost a full recapture.

> It **refuses a worker mid-capture**, and that refusal replaced `serial: 1` doing the job badly.
> Serialising made provisioning-during-a-run survivable rather than impossible — it restarts a worker
> mid-capture, destroying 12–520 s of unresumable work, and splits `provisionRevision` across the corpus.
> `sleep.yml` already had the refusal twenty lines away. With it in place, `--serial=0` is the normal way
> to converge a fleet: measured 2026-08-25, **10 m 07 s across five boxes against 26 minutes serial** —
> and serial ALSO fired the `run_once` Node-version lookup once per box, defeating the guarantee its own
> comment describes, because `run_once` means once per BATCH.

## Three systemd polling facts, and the pct-exec history

This replaced `ssh root@<pve> 'pct exec <container id> -- bash -lc "..."'`, which existed nowhere in the source tree —
so the way this project's most expensive operations were started was untested and unreviewable. `command`
with `argv:` never invokes a shell, which removes the quoting class that sent four capture shards at
`--worker=http://:8765` for 29 minutes. **The lab is reached DIRECTLY at its own IP; there is no `pct exec`
hop**, and that second hop was the whole source of the quoting problem.

**AND EXIT ON A POSITIVE VERDICT, never on the absence of a marker.** The third variant, and it completes
the set — all three are this file's oldest defect wearing a poll's clothing. A waiter written as
`until ! <status> | grep -q RUNNING` finishes the moment the status command FAILS: a dropped connection
prints nothing, `grep` finds no `RUNNING`, and the loop reports a finished run for one still going. The
sound form names the outcomes it will accept — `grep -qE "SUCCEEDED|FAILED|NOT LOADED"` — so a silent
status keeps waiting instead of being read as success.

Together, the three: poll a field that EXISTS, wait for the state to LEAVE `running` rather than to equal
one of the terminal values you happened to think of, and finish on something the tool SAID rather than on
something it did not say.

**And before backgrounding ANY waiter, prove its condition can be true at all.** The sibling of the
SubState rule, and it has now bitten three times in one session. A waiter polling
`capture-progress.json` for `p.captured` ran for an hour against a file whose keys are
`startedAt, updatedAt, finishedAt, outcome, worker, baseUrl, captureTimeoutMs, total, workers, current,
cases` — there is no `captured` field, the progress is a per-case map under `cases`, and `?? 0` turned the
absence into a number that could never grow. One command against the real artefact answers it; a
backgrounded loop against a guessed shape reports nothing for as long as you let it. This is the
repo's own "a test written against a shape you did not verify" rule, applied to a poll instead of a test.

**WAIT FOR `SubState` TO LEAVE `running`. Never wait for it to EQUAL a terminal value.** A unit has
several terminal SubStates — `exited`, `failed`, `dead` — and which one you get depends on how it ended
and whether anything reaped it. Measured 2026-08-30: two waiters written an hour apart, one polling for
`SubState=exited` and one for `exited|failed`, both hung indefinitely on jobs that had long since
finished, because the units read `failed` and `dead` respectively. That is the `is-active` defect wearing
its own remedy — the right field, tested the wrong way round — and `run-job.yml` already gets it right
with `until: 'Running' not in ...`, which is the form to copy.

**Three systemd facts, measured, that any status check must respect.** Poll `SubState`, **never
`systemctl is-active`** — under `--remain-after-exit` an exited unit reads `active (exited)` forever, so a
waiter on `is-active` hangs indefinitely reporting "still running" for a finished job. `Result` and
`ExecMainStatus` are populated **while the job is still running**, so they mean nothing until `SubState`
leaves `running`. And use `--remain-after-exit` rather than `--collect`, or the exit code is discarded at the
moment it matters. `lab-job.test.ts` pins all three.

**A job of a given name is refused, not killed, while one is running.** The unit name is the lock and it
holds against the ssh path too, which an in-process flag could not.

`packages/control/ansible/README.md` is the map: why SSH and not WinRM (the blank-password guard),
why not an `/admin/update` route (the worker has no auth and binds all interfaces), and the two Windows
gotchas that otherwise cost an afternoon — `administrators_authorized_keys` and OpenSSH's `DefaultShell`.
The fleet is defined **once**, in `inventory.yml`.

## Eight verifications, and only two were automatic

This project had eight verifications and only two were automatic, and the record of what that produces is
unambiguous: `capture-check` was *required* after any change to `capture-core.mjs` and had never run once;
`release:gate` was broken from the day it was written (it invoked the acceptance evaluator with no
`--data`, so stability could not be measured, and reported "not measured OR unstable" in one string); and
the acceptance gate sat FAILING while three other gates were green. Every gate run for the first time
found a real defect. **Automate a check or lose it** — the same rule this file already applies to worker
VMs, the page server and NVDA.

## Resolves to `dist` does not say WHOSE

  > **This said "resolves to `dist`" and never said WHOSE, and that gap cost real time on 2026-09-06.**
  > A worktree whose `node_modules` is a symlink to the PRIMARY checkout's resolves every
  > `@a11y-witness/*` import to the primary's `packages/*/dist`, not the worktree's own — so `npm run
  > build` in your own worktree changes nothing a cross-package tool reads there. `orchestrator` read the
  > primary's two-hour-stale `dist`, concluded a generator was broken, and was about to dispatch a worker
  > at a defect that did not exist. The check that missed it was `ls -ld
  > node_modules/@a11y-witness/judge` — a proper symlink, to another repository, which answered "is this
  > a symlink" when the question was "to WHICH checkout". **Verify WHOSE, by resolving the exact
  > specifier you import** — not the package name, since a package can export subpaths from elsewhere and
  > resolving `@a11y-witness/judge` does not prove `@a11y-witness/judge/rules` came from your tree:
  > `node -e "console.log(require.resolve('@a11y-witness/judge'))"`. A mutation check that BITES is
  > itself evidence the resolution reached the code under test — if a worktree's test were reading
  > another checkout's `dist`, editing the worktree's source could not have reached it and the mutation
  > would never fail. See `docs/roles/worker-loop-orchestrator.md` for why the fleet-driving primary
  > checkout stays on `main` with nothing checked out in it, which is the second half of this fact.

## The same stale-compile defect in Python

- **The same defect exists in PYTHON, and it decided a mutation check wrongly on 2026-09-03.**
  `importlib.util.spec_from_file_location` honours `__pycache__`, so pytest and a bare `python -c` both
  executed a STALE COMPILE of `audit-scorer-shortcuts.py`. The visible symptoms were a comprehension
  raising `StopIteration` on empty input while the identical shape in isolation returned `[]`, and a
  mutation that "survived" — on the strength of which a working guard was deleted as dead code. That is
  the stale-`dist` lesson exactly: *"my test is weak" and "my test is old" read the same.* `test:python`
  now runs `PYTHONDONTWRITEBYTECODE=1 pytest -p no:cacheprovider`, because mutation checking is the
  technique this project relies on most and a stale compile can decide one either way.
  > **And a mutation result is a fact about the code AT THAT INSTANT, not a licence to delete.** The
  > guard removed above was genuinely dead against the value expression standing at the time, and stopped
  > being dead the moment that expression changed. "Nothing fails when I break it" answers a narrower
  > question than "this is unnecessary".

## fleet:deploy/fleet:provision refuse a capturing worker

**`fleet:deploy` and `fleet:provision` REFUSE a worker that is capturing.** Added 2026-09-05, after a
deploy went out three minutes into a capture run and killed 12 in-flight captures — *"worker forgot
capture &lt;id&gt; after accepting it — it restarted mid-capture, so the work is gone"*. `sleep.yml` had had
that refusal for weeks and `provision-role.yml` had copied it; the one play whose own header explains at
length that it REBOOTS every guest it touches checked nothing. A HARD fail rather than a skip, because a
half-deployed fleet runs two `codeVersion`s and `assertFleetRunsThisCheckout` then refuses every capture
run — so skipping the busy box leaves you a stale fleet AND a destroyed run. `-e a11y_force_deploy=true`
overrides, and the refusal names it. **`recover.yml` and `restart.yml` are exempt in the OTHER
direction** — both exist to act on a worker that is busy AND wedged, so the check would refuse their only
case. `busy-worker-guard.test.ts` DISCOVERS every playbook targeting `a11y_workers` and fails until a new
one is classified; a test naming `provision-role.yml` by hand could never have seen `deploy.yml`.

`fleet:status` is the "which box is the problem" answer: per worker, its state, its `/health.code`, and —
for a busy one — the case it is on, how long it has been there and the phase it is IN, read from
`/progress`, which every worker has served since forever and nothing consumed. It surfaces a **degraded**
guest, which is the fault that produces zero failures: the worker's own retry absorbs every recovery, so
`failures` stays 0 while that box runs at three times its neighbours' cost.

## A new box needs no console visit, and the protocol-version trap

**A new box needs no console visit.** `packages/worker-fleet/src/provisioning/bare-metal/` is an x64
`autounattend.xml` for the PXE server: Windows installs, the account is created, sshd comes up with your
key already planted, and the worker serves. `roles/worker/` is provisioning ported to Ansible modules and
runs alongside `provision-nvda-worker.ps1` until parity is proven — see that README before deleting
either, because `provisionRevision` is a **capture cache key** and retiring the script moves it.

It pushes **every hashed file** (27 now, defined once in `packages/nvda-worker/src/worker-files.mjs` — the
list used to be duplicated in `server.mjs` and `check-worker-code.mjs` with a third derived by regex in the
deploy script), reboots each guest — mandatory, because
`utmctl exec` cannot be trusted to restart the worker — and verifies `/health.code` over HTTP, which
shares no failure mode with the push. Then it puts each VM back in the state it found it.

Doing this by hand is how two guests once served stale code for an hour, and pushing a subset leaves a
guest running a mix with no clue which file is wrong. **Roll back** by checking out the ref you want and
running it again; git is the source of truth, so there is no bespoke backup to go stale.

> **`worker:deploy` refuses a `CAPTURE_PROTOCOL_VERSION` change** unless you pass
> `--allow-protocol-change`. That value is a capture-cache key: deploying a bump invalidates all 2,122
> cached captures and forces a full recapture. Note the trap it guards — an *uncommitted* bump makes
> `worker:code` report every worker STALE because the LOCAL hash moved, and "redeploy" would then ship
> the bump and wipe the cache for no reason. `worker:code` says so when it applies.

## RESTORE FROM A COPY, NEVER `git checkout --` -- the incidents

- **RESTORE FROM A COPY, NEVER `git checkout --`. Three times in one night, 2026-09-06.** Mutation
  checking means editing a file you are about to restore, and `git checkout -- <file>` restores it to
  HEAD — which silently discards every UNCOMMITTED change in that file, not just the mutation. Twice in
  one session it destroyed a feature mid-build (`capture-status.mjs`'s whole `--since` implementation,
  rebuilt from saved patches; then `lab-job.yml`'s progress declarations); a peer session hit it the same
  night on a branch with no prior commit to fall back to, so there was nothing to recover from at all.
  `cp <file> /tmp/x && <mutate> && <run> && cp /tmp/x <file>` costs one command and cannot do this.
  CLAUDE.md already records `git checkout --` as "the command that once destroyed release-eligible
  weights in this repo" and `lab:reset` exists to avoid it — the mutation-check workflow is the same
  hazard reached by a different door, and it is the workflow this project relies on most.

## Backfilled verbatim text (#458 split compression pass)

### The abstention-referral collapse

And the measurement that matters most is not in any of them. `calibrate-abstention.mjs` on the lab is the
only check that scores REAL pages through the product path, and its ASSERTED-WRONGLY column is the number to
watch: a criterion the tool STATES is unsatisfied on a page its publisher declares conformant. `referred` is
a different and much cheaper kind of wrong. Collapsing the two is what made the number meaningless for a day.

### Run the clean-code review on your own diff before you push

**Run the clean-code review on your own diff before you push.** Not on the whole repo — on what you
changed, plus anything the Boy Scout Rule says you should have tidied in passing. It is a judgement
pass, so it cannot live in the pre-push hook next to lint and `tsc`: those catch the mechanical half
(`max-lines-per-function`, `complexity`, `no-empty`), and the half that actually costs this project
money is the other one — does the function do one thing, does the name reveal intent, is a caught
error genuinely handled or merely logged. Three of the worst defects recorded in this file were clean
by every mechanical check and would have been caught by reading the diff and asking those questions.

Review before pushing, not after: a review that lands after the commit becomes a follow-up nobody

### Run npm test, never npx tsx --test directly, across packages

- **Run `npm test`, never `npx tsx --test <file>` directly, when you have changed another package's
  source.** Cross-package imports resolve to `dist` (every `exports` entry points there), and `npm test`
  has a `pretest` build that keeps it honest. Run the file runner on its own and you test the LAST BUILD:
  measured 2026-09-02, a mutation check on `packages/judge/src/outcomes.ts` reported the guard as not
  firing, because the mutation was in source and the test was reading `dist`. That reads as "my test is
  weak" and is really "my test is old" — the same stale-`dist` shape as `rules:gate` scoring a rule the
  compiled bundle did not contain, arriving through the test runner instead of through a gate.

### Use the worker mode for capture:check

  **Use the worker mode.** The in-process mode still exists (it is what `capture-regression.yml` runs on a
  Windows runner, which has no worker) and it refuses while a worker is serving — correctly, since NVDA is
  one machine-wide resource. But that refusal is why this check went unrun through many capture-core
  changes: it meant stopping `a11ysrv` on the guest, driving a scheduled task in an interactive session,
  and starting it again. A verification that costs a ceremony is one that does not happen, which is this
  file's own rule about housekeeping applied to testing.

  Nothing is lost by going over HTTP: every assertion is a pure function of the capture RESULT, which the
  worker returns. It is arguably the better test, since it exercises the path production uses. Run
  `packages/lab/scripts/bench-capture.mjs` too if you touched timing. The VM capture is its test; the book's rule is

## The page server refcounting incident

- **The dataset page server** — leased the same way (`packages/lab/src/training/page-server.mjs`), and the
  lease is **refcounted**, because it had to be: the header's rule ("a long run must not shut down something
  another run is using") protected the ADOPTER and not the STARTER, so a one-case capture run killed the
  server a 48-capture `evidence:check` was still using, 46 captures read a dead port, and they all
  "succeeded" because Edge serves its own error page. Holders are recorded on disk with the server's pid, so
  the last one out stops it whether or not it started it, and `kill(pid, 0)` liveness means a crashed holder
  cannot pin a server forever. `EPERM` counts as ALIVE — after pid reuse a recorded holder may be somebody
  else's process. A run starts it
  if missing and stops it afterwards, including on SIGINT; a server somebody else started is used and
  left alone. This replaced a manual `npx serve` that had leaked four processes onto this host, one of
  which was a stray that could 404 an entire run while it reported success.

### The pre-push hook's scope, verbatim

**Three checks, since #911 (2026-09-11, step 4 of the CI Reset). The hook is a COURTESY; CI is the gate.**

| | |
|---|---|
| **lint** | the paths this branch changed against `origin/main`, PLUS anything dirty in the tree. By PATH and not by changed PACKAGE: `changed-packages.mjs` lists `packages/<name>` directories only, so a `scripts/`-only change — the most common shape of a row here — scopes to the EMPTY list, and a check handed an empty population reports clean about a population it never read. And the tree as well as the diff, because every note in the hook says the gate reads the TREE rather than the commits being pushed: a list built from `origin/main...HEAD` alone lints nothing on the first push of a new branch |
| **typecheck** | the WHOLE program, and the reason is the mechanism rather than a preference. tsc's unit is the program, not the file. Measured at `40e36ba4`: the root program is 953 files (534 `.test.ts`, 130 top-level `scripts/`); `tsc -p packages/<name>` is **0** test files, because every package tsconfig carries `"exclude": ["src/**/*.test.ts"]`; and no package program contains top-level `scripts/`. So "typecheck the changed packages" drops 664 of 953 and reports clean — the root tsconfig's own comment records that regression happening once already, 25 test files silently unchecked |
| **the leak scan** | `tracked-source-leak-guard.test.ts` and `tracked-prose-leak-guard.test.ts`, by name. **The one check whose value is being BEFORE the push rather than before the merge**: this repository is public, so a pushed branch is visible the moment it lands. It was two of the 22 files in `guards:sweep`, which is why "keep the leak scan and delete the sweep" would, taken literally, have deleted it |

**What went, and why none of it is a reduction in what gets checked:** the 22-file tree-wide sweep, an
`.mjs` parse check, a board-guard glob and a changeset gate all run again in CI minutes later, on the
whole tree. Wall clock at `40e36ba4`: the sweep alone was 30.22 s of about 39 s; lint 3.93 s, typecheck
4.86 s, the two leak guards 1.39 s. The hook is about 10 s now, and **75% of that saving is the sweep**.

**`training:check-signals` and `rules:gate` are not run here at all, and the hook says so unconditionally**,
naming the lab job that answers each. They read the corpus in gitignored `runs/`, and the 2026-09-06 ruling
is that such a gate gives a VERDICT only when the agent driving the fleet and the lab runs it — in this
hook it could only ever have been a pre-check. Unconditional matters: the old form was gated on `runs/`
being present, so it was SILENT on exactly the machine holding a stale copy, which is the machine that most
needs telling. One measured here was 89 hours old.

**The fast/full split is gone with it, and it had a hole worth recording**: the BOARD-ONLY path ran the
board guards instead of lint and typecheck, and never ran the sweep — so it never ran the leak guards, on
the one kind of diff (`docs/board/summaries/*.md`) made entirely of the prose they scan.

**The git-only refusals stay** and are outside the "three checks" claim by name: the stale-base check,
`resolve-toward-main`, the 300-deletion warning, the armed-PR lookup and the `A11Y_SKIP_VERIFY` gate. None
is a copy of CI, each costs milliseconds, and each is push SAFETY rather than verification.
`A11Y_SKIP_VERIFY_REASON="<why>" A11Y_SKIP_VERIFY=1 git push` overrides the checks and prints the reason; a
bare `=1` is refused. The worker- and Codex-dependent gates stay release-time: a 75-minute check on
`git push` gets the hook deleted within a day.

**What it held before #911, kept verbatim because CLAUDE.md's own line is the thing that changed:**

```
git push                      # pre-push hook: lint, typecheck, tests, check-signals, rules:gate (~5s)
```

> The pre-push hook holds only what costs nothing (~5s, no worker, no network) and SKIPS corpus-dependent checks loudly when `runs/` is absent, rather than passing quietly. `A11Y_SKIP_VERIFY=1 git push` overrides it.

`pre-push-hook-scope.test.ts` is what holds the hook to three — it parses the hook's own `run` call sites
and every npm/node invocation outside them, and a fourth check fails it.

## Why the deprecation note exists, and what "kept" means

> **This note exists because the omission cost a wrong turn on 2026-08-28.** The section below opened with
> `worker:ctl -- up`, so a capture-path change was taken to a laptop VM while five bare-metal workers sat
> `ready` and CONSISTENT. Nothing in this file recorded the deprecation, and an agent reading it did the
> documented thing. **A deprecated path that is still the first one documented is not deprecated**, which
> is this file's own rule about anything relying on a human to remember.
>
> Everything below about VM sizing, `utmctl`, pausing and the pool is kept because the MEASUREMENTS behind
> it are still the reasoning for how the fleet is run — the negative-scaling finding, the ~8 GB-per-guest
> figure, `phys_footprint` vs RSS. Read it as the record of why, not as instructions.

## JUDGE_BACKEND defaulted to codex until 2026-08-04

  > It defaulted to `codex` until 2026-08-04, and the GitHub Action already shipped `local` — so
  > `npm run eval` and `npm run eval:gate` measured a rented model and **never once measured ours**. A
  > gate that does not exercise what ships is not a gate. Flipping it immediately surfaced two real
  > defects invisible to an LLM that only reads transcripts: a starved scorer asserting on seven
  > conformant fixtures, and a crash on an out-of-scope (VoiceOver) capture.
  >
  > **`JUDGE_BACKEND=openai`** talks plain `/v1/chat/completions` over `fetch` — no SDK — so it works
  > against hosted OpenAI, Anthropic's OpenAI-compatible endpoint, and a local server (Ollama, LM
  > Studio, vLLM, llama.cpp) alike. `JUDGE_STRUCTURED` defaults **on**: the backend sends a JSON schema
  > as `response_format` so the server grammar-constrains its output, which is what eliminates the
  > malformed/empty-JSON failures a small local model otherwise produces. Set `JUDGE_STRUCTURED=off` if
  > a server rejects `response_format` outright. See `packages/cli/README.md` for the consumer-facing
  > version of this — `OPENAI_API_KEY` / `JUDGE_API_KEY`, `JUDGE_BASE_URL`, `JUDGE_MODEL`.

## The asserting-subtypes count has drifted three times

The sentence naming how many rules-owned subtypes actually assert read "4 of the 11 ... the other seven" while the real answer was 14 and ten — it moved on 2026-09-06 to 16 and twelve, when `1.4.2:autoplay-uncontrollable` and `2.4.7:focus-removed-on-receipt` were declared, both `modelHead: false` so no head is fitted — and it moved again the same day to 17 and thirteen, when `2.4.7:script-blur-completed` (issue #14, a single provisional case measuring `FOCUS_SCRIPT_WINDOW_MS`'s unverified fast side) joined them. The test caught the staleness every time, which is the point of pinning a prose count to an artefact. Every mapping is declared in `act-rules.ts` in ACT format and pinned by `act-rules.test.ts`; `rule-ownership.json` does not carry it.

**A FOURTH drift, 2026-09-09 (#869, issue #79):** `1.3.5:input-purpose-invalid` (`addUnidentifiedInputPurpose`) joined the rules-owned set at `mapping: "secondary"` in `act-rules.ts` — not `conformance`: F107, the failure technique this rule is named for, fails a field when its `autocomplete` value "doesn't match the input's purpose" AND "the purpose isn't communicated through alternative methods", and this rule only ever checks whether the value is a real token AT ALL (never whether a real token matches the field's actual purpose, and never the alternative-methods clause) — narrower than F107 itself, on the same 1.4.2 precedent: a deterministic DOM read whose criterion still carries an exception the census cannot see stays `secondary`. So the ASSERTING count and its four names did not move; only the rules-owned total did, 4 of 17 to 4 of 18, and the remainder word with it, thirteen to fourteen.

### The row exactly as it stood before the fourth drift

| **rules** (`rule-ownership.json` → `decidedBy: "rules"`) | the only layer that MAY assert — but only 4 of the 17 rules-owned subtypes actually assert (`1.1.1:missing-alt`, `1.1.1:filename-alt`, `4.1.2:unnamed-control`, `4.1.2:state-change-silent`); the other thirteen map as `secondary`/`cantTell` because they INFER where the four READ directly. `asserting-subtypes.test.ts` pins both numbers against the artefacts — this count has drifted three times as subtypes were added. [Drift history →](docs/operational-lessons.md#the-asserting-subtypes-count-has-drifted-three-times) Exact on every criterion it owns, 0 false positives across 1,183 conformant records. |

### Verbatim original table row

| **rules** (`rule-ownership.json` → `decidedBy: "rules"`) | the only layer that MAY assert — but owning a subtype and conformance-mapping it are two independent facts, and **only 4 of the 17 rules-owned subtypes actually assert** — the other thirteen map as `secondary` and report `cantTell`, deliberately, because they INFER the failure where the four READ it directly. The four are `1.1.1:missing-alt`, `1.1.1:filename-alt`, `4.1.2:unnamed-control` and `4.1.2:state-change-silent`; `asserting-subtypes.test.ts` pins both numbers and that membership against the artefacts, because this sentence read "4 of the 11 ... the other seven" while the real answer was 14 and ten — it moved on 2026-09-06 to 16 and twelve, when `1.4.2:autoplay-uncontrollable` and `2.4.7:focus-removed-on-receipt` were declared, both `modelHead: false` so no head is fitted — and it moved again the same day to 17 and thirteen, when `2.4.7:script-blur-completed` (issue #14, a single provisional case measuring `FOCUS_SCRIPT_WINDOW_MS`'s unverified fast side) joined them. The test caught the staleness every time, which is the point of pinning a prose count to an artefact. Every mapping is declared in `act-rules.ts` in ACT format and pinned by `act-rules.test.ts`; `rule-ownership.json` does not carry it. Exact on every criterion it owns, 0 false positives across 1,183 conformant records. |

## The file's own self-description, before the #458 split

This file is for working ON the repo, and it is long because it is a record of what specific mistakes cost. No longer true after #458: the record moved to this file and its siblings, and CLAUDE.md itself is rules only.

## a11y-worker-10, WITHDRAWN 2026-09-07, REJOINED 2026-09-09

**It never needed the console visit.** Measured 13:10-13:12Z on 2026-09-09, probing it directly because a
commented-out host is invisible to `fleet:status` and nobody had re-checked it in two days:

```
GET /health          200   ok:true  ready:FALSE  busy:false
SSH port 22          OPEN
ICMP                 100% loss
uptimeMinutes        6636  = 4.6 days -- it had NOT rebooted since ~2026-09-04
provisionRevision    ba7f4174f90053f8   -- IDENTICAL to the live fleet
readiness            every check passed EXCEPT noForegroundBlocker
foregroundBlockedBy  { owner: "ShellExperienceHost", title: "New notification" }
```

The withdrawal note said *"It answers neither `/health`, nor SSH, nor ICMP."* **Two of those three were
false.** A Windows toast was holding the foreground; the box was serving throughout.

Rejoined the same afternoon -- uncomment, `fleet:deploy --limit`, `fleet:recover --limit` -- with
`fleet:status` reading **10/10 ready, fleet CONSISTENT** at 13:21Z, every box on `691969f6a8f1dd11`.

### Three things the next diagnosis should take from this

**The box had 4.6 days of uptime ON THE 7th, so whatever failed then was A PATH TO IT, not the box.**
`fleet:wake`'s magic packet went to a machine that was already awake, and its *"did NOT come back"* was
true of the probe rather than of the hardware. A wake that fails against a running box is not evidence
about the box at all.

**ICMP loss on a Windows box is the FIREWALL'S DEFAULT and is never evidence of anything.** It is the
cheapest of the three probes and the only one that stayed down. Weighting it is what made a live box read
as absent. Do not put ping in a liveness verdict for a Windows guest.

**`fleet:deploy`'s reboot is CONDITIONAL and cannot be relied on to clear a foreground blocker.** This was
predicted as "a reboot clears it by construction" and it did not happen: the deploy reported
`ok=14 changed=4` with `TASK [Reboot] skipping`, because the scheduled-task restart had already picked up
the files -- and `uptimeMinutes` kept climbing through 6640, 6641, 6642. **The code updated and the
blocker stayed.** `fleet:recover` reboots unconditionally and PROVES it (*"restarted -- uptime 0m"*),
which is the check that caught the wrong prediction.

### What CLAUDE.md said until 2026-09-09, kept verbatim

Kept rather than deleted, because a figure with the reason it was wrong beside it is worth more than a
figure quietly replaced — and `claude-md-content-preservation.test.ts` requires anything trimmed out of
CLAUDE.md to survive somewhere under `docs/`:

> **THE LOCAL UTM WORKER VMs ARE DEPRECATED. Capture on the bare-metal fleet.** NINE boxes

> [`-10` status →](docs/operational-lessons.md#a11y-worker-10-withdrawn-2026-09-07)) serve

### The address is deliberately not in this file

This section names the box by its **inventory name** and never by its address, and the quoted error above
is redacted to `<a11y-worker-10>` for that reason. **The address lives in `/etc/a11ign/inventory.yml` and
nowhere else** — the rule #83 set and that `docs/board/reported/` already follows: hosts by inventory
name, paths by fact name.

It is worth saying because the temptation here is FIDELITY rather than carelessness: the sentence is a
quotation of a real refusal, and quoting it exactly is what a record is for. `tracked-source-leak-guard`
refused this file for it, correctly, and the same instinct put the real address into `rescue-hunk`'s own
test earlier the same day — in the tool written to stop un-redactions.

### Why it was commented out rather than left to fail

Kept, because the reasoning holds for the next genuinely dead box. `lab_fleet_workers` is every host in
the group, unconditionally, with no health filter -- so a dead box there is dispatched work by every
pooling job and takes the run down with it. Measured 2026-09-07: `capture-only` died on *"The worker at
http://<a11y-worker-10>:8765 did not answer /health"* after the job had already started.

## Guard triage 4 of 6: the tracker, board and label guards, and why each existed

**The CI Reset (10 September 2026) retired the nine-session org shape these guards policed** --
`session:dispatcher`, `session:orchestrator`, `session:worker-audit`, `session:worker-contracts` and
`session:worker-config` are gone, and the four roles left are product-manager, eng-capture, eng-judge and
fleet. A guard that checks a label nobody applies cannot fail, which is worse than no guard: it is a green
check nobody can interpret. Each one had a real incident behind it, and the incident is still true -- only
the org shape it was policing is retired. Recorded here per the chairman's condition on the deletion,
rather than let the incidents disappear with the files.

**`board-style.test.ts`** (#20, #159, #284) -- pinned the board body's word cap (925 words) and a curated
verb/style list, after #576 sent the body over cap and turned `trunk-guard` red until reverted. The board
report survives with one smoke test (below); the style policy is now a human editorial judgement, not a
build dependency.

**`board-markdown.test.ts`** (#159, #827) -- pinned `toHtml`/`inline`'s Markdown-to-board rendering rules.
Retired with the rest of the board content-policing family; the render mechanism itself is covered by the
new smoke test.

**`board-schedule.test.ts`** (#590) -- pinned `board-report.yml`/`board-summary-check.yml`'s cron
expressions against the London hour claimed in the workflow's own logic, plus a retired-21:00-entry ghost
check. The underlying schedule is unchanged by this row (#901 explicitly kept it), but asserting the
workflow's *internal* time-consistency at the pull-request level is the same shape as the other retiring
board-content pins: a fact about the board's own operation, not about whether the code that shipped works.

**`board-summary-origin.test.ts`** (#22, #131, #159) -- pinned that the 21:00 (later 07:45) summary check
reads `origin/main`, never a working tree, after a summary was found reporting on state that did not exist
as far as the edition was concerned.

**`board-achievement-retirement.test.ts`** (#284, #827) -- pinned the three-edition rule for how long an
achievement stays in the board body before moving to the record.

**`board-achievement-staleness.test.ts`** (#90) -- pinned that an authored capability claim in the board's
own §3 gets re-checked rather than trusted forever once written.

**`board-record.test.ts`** (#576, #577, #806) -- pinned that writing a board achievement record refuses at
write time when it would displace one, after the word cap incident above cost a red `trunk-guard` until
reverted.

**`board-report.test.ts`** (#9) -- the detailed render-section test for `scripts/board-report.mjs`,
replaced by a single smoke test (`board-report-smoke.test.ts`) proving the renderer produces output
without throwing. The detail this file asserted (individual section wording, pluralisation, edge counts)
is now a human's read of the rendered document, not a build dependency.

**`audit-citation-index.test.ts`** and **`audit-findings-dispositioned.test.ts`** -- pinned that
`docs/architecture-audit.md`'s frozen findings were each dispositioned (closed, or cited by a test that
would fail if the finding recurred) somewhere the audit's own freeze policy could not reach. The audit
document and its disposition-tracking apparatus are a tracker mechanism from the nine-session org; the
findings themselves, where still relevant, live on as ordinary GitHub issues under the new org.

### Five candidates named in the plan, checked and NOT deleted

`workflow-lane-check.test.ts`, `a-hold-means-cannot-merge.test.ts`, `pr-hold.test.ts`,
`merge-guard-pr-hold-rule.test.ts` and `arm-pr.test.ts` all name "hold", "lane" or "session-label" --
families this row's own plan lists as retiring. Read individually rather than deleted on the name match,
because each tests a mechanism **currently, actively wired into a required CI job today**, not merely a
retired label taxonomy:

- `workflow-lane-check.mjs` runs as its own step inside `ci.yml`'s `mergeSafety` job, right now, on every
  pull request.
- `merge-guard-pr-hold-rule.test.ts` covers one rule composed into `merge-guard.mjs`'s
  `mergeSafetyVerdict`, which `mergeSafety` calls directly (`node scripts/merge-guard.mjs --ci-gate`).
  `mergeSafety` is removed as a job by #902 -- not yet merged at the time of this row -- and only then
  does this rule's test stop guarding something live.
- `pr-hold.test.ts` and `a-hold-means-cannot-merge.test.ts` between them are the **only** test coverage
  for `pr-hold-state.mjs`'s `armVerdict`/`armabilityOf`/`disarmVerdict` -- the exact functions
  `auto-arm.yml`'s "Enable auto-merge... unless held" step calls on every arm attempt.
- `arm-pr.test.ts` covers `arm-pr.mjs`'s `armDecision`, invoked by `auto-arm.yml` on every PR armed
  (`node scripts/arm-pr.mjs --pr=... --repo=...`). `claim-provenance.mjs` (#848) is a durable *second*
  answer to "who worked this row" -- it does not make `arm-pr.mjs` itself dead code today.

Deleting any of the five would leave a live, merge-blocking mechanism with no test at all until the row
that retires its *calling* workflow lands. Left in place; a future row may retire them once #902 (and
whatever eventually replaces `pr-hold`/`arm-pr`'s labeling for the new four-role org) actually ships.

