# Release status

What is verified, what is not, and what is deliberately deferred. Written to be read before shipping and
believed afterwards — every line is a measurement, not an intention.

## Verified at this commit

Run on a **clean checkout of `HEAD`**, which is what CI and a consumer see:

| check | result |
|---|---|
| unit tests | **371 pass, 0 fail, 2 honest skips** (the two git-dependent tests, in a tree with no `.git`) |
| typecheck | clean — and now actually covering the package tests: `tsc --listFiles` showed **0** of them in the program before M5, 24 after |
| lint | 0 errors (317 warnings, all `no-magic-numbers`, non-blocking by design) |
| `gate:isolation` | **6/6 packages usable when installed**, 1 private package skipped and announced |
| `rules:gate` | **PASS** — every rule-owned subtype exact on real captured evidence, **0 false positives across 1,003 conformant records** |
| held-out acceptance | **PASS** — `"passed": true`, no failure reasons |
| `npm run eval` (judge quality) | **recall 90%, 0 false positives on conformant pages**, 16 failure-case runs |
| `verify.corpus.test.ts` | 6/6 |
| CI (`lint` + `capture-regression`) | **both green** — first time since 1 August; the fix was `capture-pure.mjs` |
| shipped model | `releaseEligible: true`, **0 warnings** |

Measured on a tree containing only committed content, which is what CI and a consumer see. `release:gate`
itself stops at `check-signals` for the 418 stale captures recorded below — a corpus-state item, deliberately
deferred; every other stage above was run individually.

The judge runs on **our own trained scorer** (`judge-backend: local`) — 27 KB of heads over an 87 MB
encoder. No LLM, no API key, nothing leaves the runner.

> **Corrected 5 Aug.** The figures above were first recorded while `scripts/score-screenreader-model.py`
> — the program that *is* this backend — had never been committed. It existed only in one working tree,
> so a fresh clone could not run its own default judge, and the numbers were produced by a file no
> consumer received. `npm pack` includes untracked files, which is why installing it appeared to work.
> The program is now tracked, resolves from `import.meta.url` rather than the process cwd, and
> `npm run eval:gate` reproduces these exact figures from the committed tree. A test now asserts that
> every `scripts/…` program referenced by `package.json` or `action.yml` is tracked in git.

### The claim this project exists to make, demonstrated

Against the University of Washington "Accessible University" demo — a third-party, expert-built
inaccessible page and its accessible twin:

| | before (inaccessible) | after (accessible) |
|---|---|---|
| screen-reader layer | 1.1.1, 1.1.1, 4.1.2, **2.4.4**, **1.3.1** | **none** |
| axe | 1.4.3, 3.1.1, 1.1.1, 4.1.2, 1.4.1, 2.5.8 | **none** |

Two findings only the screen-reader layer produced, quoting what a user hears:

```
2.4.4 Link Purpose          heard: "click here, link"
1.3.1 Info & Relationships  heard: "102 announcements, no heading among them"
```

axe reports neither, and not by oversight: its `link-name` rule asks whether a link *has* an accessible
name, and "click here" has one. Meanwhile axe found four things a screen reader cannot perceive at all.
Neither layer subsumes the other — and the accessible twin is clean on both, which matters more than the
findings.

## NOT verified

- **The `anthropic` and `openai` judge backends.** Written to their SDK specs and unexercised; this project
  keeps no metered key. They are opt-in, never the default.
- **The Action on a real Windows runner.** Its logic is covered by 14 renderer/policy tests and by
  `packages/lab/scripts/action-dry-run.sh`, which runs the Action's own bash locally against a live worker. The
  Windows-only setup steps (NVDA install, Speech Viewer, Edge policy) are exercised by
  `capture-regression.yml` on a real runner for the same reasons. `act` cannot help — it is Docker/Linux
  and NVDA needs Windows.
- **`msEdgeImageMagnifyUI`** in `--disable-features`. The name is taken from Microsoft's documented *enable*
  flag and is unverifiable through CDP (`SystemInfo.getFeatureState` answers "Unknown feature" even for
  flags that demonstrably work). It is a belt beside a verified brace — `pointer.mjs` is what actually
  closes that hole.

## Known limitations, stated plainly

- **The trained scorer does not generalise to real pages yet.** It scores 0.997 on a page from its own
  distribution and **≤ 0.002** on the UW inaccessible page. The cause is measured: the training corpus had
  a median of 0 links and a maximum of 1, where real pages carry 41–47, so the model's structured features
  sat 10–40× outside its fitted range. **On real sites the deterministic rule layer is what finds things**,
  including both findings above.

  **The generator half of the fix has landed** (`6d5fcae`): the corpus now generates a median of 14 links and
  a maximum of 40, and a capture was measured reaching 25 of 25 links on a rescaled page. What remains is
  mechanical and expensive — recapture 848 pairs and retrain. Until that runs, the SHIPPED model is exactly
  as limited as this paragraph describes, because it is still the model trained on the old corpus.
- **`task` does nothing on the defaults.** With `judge-backend: local` and `probe-forms: false` it is
  carried through and consumed by nothing. It becomes load-bearing the moment you enable `probe-forms` (it
  selects which control is activated) or switch backend. Documented in `docs/github-action.md`.
- **`taskCompletable` is a coarse proxy** — derived from "did anything score as a blocker", because this
  layer has no head for task completion.
- **A page behind a consent wall is refused, not reported.** The screen reader is held inside the modal, so
  the capture describes the dialog rather than the page; the run exits 2 and says so. Correct, but it means
  many EU-facing commercial sites cannot be measured without dismissing consent first.

## Deferred, with the reason

Not bugs being hidden — work consciously not done before shipping.

| item | why deferred |
|---|---|
| **Test coverage is 47.4%, not the 85.9% the runner reports** | `npm run coverage` measures every source file; `node --test --experimental-test-coverage` only reports files a test LOADS, so 42 files with no test were invisible rather than zero. Reaching 80% needs ~2,790 more covered lines from a 3,646-line pool. Biggest: `capture-screenreader-dataset.mjs` (464), `cases.ts` (294), `cli.ts` (269), `acceptance-matrix.mjs` (239), `local-vm.ts` (208). **Arithmetic worth knowing first:** the 6 NVDA-bound files are 1,592 lines (15.7%), so 80% of the WHOLE codebase is unreachable by unit tests — the script excludes them by name and prints the exclusion every run. |
| **Four modules still run their whole program on import** (`capture-screenreader-dataset`, `stability-gate`, `evidence-check`, `doctor`) | This is the coverage blocker as much as a smell: a module that captures or deploys on import cannot be imported by a test, which is why several of the largest zero-coverage files are zero. It has bitten twice in one session — importing the deploy tool began enumerating VMs, and importing the run started a capture and leased a page server. `deploy-worker` and `check-worker-code` are already guarded; these four are the rest. |
| `probeElementsListCounts` (40 code lines) and `leaseWorkerPool` (48) reviewed and left | Both read as one thing; splitting either would need a sentinel or a mutable bag. Recorded so the decision is visible rather than an oversight. |
| Another agent's untracked `case-matrix.test.ts` reports TS7031 | Implicit `any` in destructuring against the rescaled generator's shape. Untracked, so a clean tree typechecks clean; theirs to fix. |
| **`gate:stability` FAILS on the rescaled pages — 4/6 canaries** | **This gates the recapture below and must be diagnosed first.** `form-unlabelled/good` varied its `lists` count 0,0,0,0,1 and its transcript CONTENT at identical counts; `table-unassociated-headers/bad` reached 29,29,29,29,**5** headings. The worker logged **1 recovery** during the gate, so a papered-over mute-NVDA fault is the leading suspect for the truncated run — bigger pages mean longer sweeps and more chance of a timing miss. Starting the 848-pair capture in this state would produce evidence that varies for an unchanged page, "the one defect this project cannot tolerate". |
| **Recapture 848 pairs, then retrain** — the corpus does not match its generator | The rescale is ADOPTED (`6d5fcae`), so the pages now carry real-page structure and 848 of 1,061 captures describe the old ones. ~5.8 h on one worker (1,696 captures at the measured 12.4 s; two workers halve reliability). `--resume` targets exactly these. Then retrain, and only then is the generalisation claim testable. Nothing that ships reads `runs/`: the weights are committed, the 34 eval fixtures are tracked, and `npm run eval` still reports recall 90% with 0 false positives on conformant pages. This blocks a *gate*, not the product. |
| 98 cases whose `badSignal` cannot match their own generated page | Pre-existing inconsistency in `case-matrix.mjs`, exposed by regenerating pages; the local corpus in gitignored `runs/` is inconsistent as a result |
| Scoped cache invalidation | Two recaptures were measured as 65% unnecessary — a global `CAPTURE_PROTOCOL_VERSION` invalidates captures a fix could not have touched |
| ONNX export | Would drop torch (~529 MB) from the Action's setup |
| `provisionRevision` reads `"unstamped"` | Needs a deliberate pool-wide re-provision |
| `packages/lab/scripts/check-screenreader-hardening.py` was also untracked | Now committed; backs `npm run training:hardening`, which is in no gate, so it had no effect on any recorded result |

### Why those 418 captures went stale — diagnosed, so nobody re-derives it

`check-signals` reports **554 discriminating, 83 blind, 6 contaminated, 418 stale**. The stale ones were
captured while the page rescale was live in the working tree; `3cce38d` shelved the rescale and restored the
generator, but not those captures. Measured rather than assumed: regenerating every page and comparing to the
hash each capture recorded gives **643 MATCH / 418 DIFFER**, so a regenerate cannot fix it — the committed
generator genuinely no longer produces those pages. The families are form (106), filter (106), image (61) and
the table cases.

`--resume` targets exactly these and nothing else, because `hasUsableCaptureFiles` **is** the resume
predicate — the same function `check-signals` calls:

```bash
npm run training:capture -- --resume      # 418 pairs, ~2.9 h, one worker
```

One consequence to weigh when this is picked up: the v4 scorer was trained across both page populations, so
those 418 contributed transcripts from larger pages than the corpus now generates.

## The red CI job is FIXED

`.github/workflows/lint.yml` used to fail on 6 files under `packages/lab/src/capture/nvda/`, and the cause was one line:

```
Error: No available supported screen readers
```

`@guidepup/guidepup` **throws at import time** where no screen reader exists. CI is Linux, so merely importing
`capture-core.mjs` failed — and every test that imported it to reach a *pure* helper (`sweepStepFromSpeech`,
`dedupeKey`, `phraseAction`, `crossCheckStructure`, `elementsListRowName`, `failIfScreenReaderIsMute`,
`edgeArgs`) died with it. Node reports these per FILE — "test failed" — which reads like broken logic rather
than an unavailable dependency. It had been red since 1 August, growing from 2 files to 6 as more tests reached
for pure logic through `capture-core`.

Those seven functions now live in `capture-pure.mjs`, which imports no guidepup; `capture-core.mjs` imports and
re-exports them, so every existing caller is unchanged.

**The move was computed, not eyeballed.** An earlier attempt by hand broke `capture-core` — 2,370 lines, no
local test, it only runs against real NVDA on the worker — and was reverted. This time the transitive closure
of the seven symbols was derived with the TypeScript parser: exactly 19 top-level declarations, containing no
guidepup symbol, moved with their comments attached.

Verified, in the order that matters:

| check | result |
|---|---|
| the 6 files with `node_modules/@guidepup` physically moved away | **43 assertions pass** — CI's exact condition |
| `pure-graph.test.ts` | walks the import graph and fails on a Mac if any of them reaches guidepup again |
| `node -e "import('./capture-core.mjs')"` | clean — the only real check for a `.mjs` |
| `npm run capture:check --worker=…` on the real VM | **ALL CAPTURE CHECKS PASSED**, probe values and role phrases included |
| `npm run worker:deploy` | `/health.code` matches over HTTP, which shares no failure mode with the push |
| `npm run evidence:check` | **8 compared, 8 SAME** — evidence unchanged, so the cache stays valid and `CAPTURE_PROTOCOL_VERSION` stays at 4 |

### `evidence:check` was ALSO comparing captures asked DIFFERENT QUESTIONS

Found during M5, one field along from the page problem above and invisible to it. The probes are opt-in over
the wire, so a case whose recorded options differ from what the manifest asks for now is not comparable
either: **61 cases recorded `probeTables: true` while the manifest on disk said false**, because the manifest
predated the fix that derives that flag from the signal type. The fresh capture then asked no table question,
`structure.tableCells` went 4 → 0, and the diff called it an evidence change.

Both halves are now fixed and both were proven rather than argued:

- `evidence:check` excludes cases whose recorded probe options differ from the manifest's, and says how many;
- regenerating the manifest (`npm run training:generate`) removed the mismatch — **0 cases now differ**, page
  staleness unchanged at 643 current / 418 stale — and the two cases that had reported CHANGED then compared
  **2 of 2 SAME**.

That manifest staleness mattered beyond this check: a resumed capture run would have asked 61 table cases no
table question, which is precisely the "8 cases went silently blind when a probe changed" failure this repo
already has a rule about.

### `evidence:check` was comparing captures of DIFFERENT PAGES

Its first run on this change reported **40 of 47 CHANGED**, with differences like `structure.links 40->0` — and
recommended its own worst outcome: "bump `CAPTURE_PROTOCOL_VERSION` and recapture", i.e. 2,122 captures, for a
refactor that moved pure functions between files and altered no behaviour.

Every one of those 40 was a case whose PAGE had moved since capture (the 418 above): the recorded capture
describes the shelved rescaled page, the fresh one describes the current small page. Cross-tabulated, the split
is exact — **40 CHANGED / 40 stale pages, and all 8 whose page was current came back SAME or rejected. Zero
cases changed on an unmoved page.**

So the tool now excludes cases whose page has moved, using `hasUsableCaptureFiles` — the same predicate
`--resume` and `check-signals` use, so "comparable" and "current" cannot drift apart. It says how many it
excluded (418 of 1,061 here), and if nothing is comparable it exits 2 rather than reporting SAME over nothing.

This matters beyond one refactor: `evidence:check` exists to make a capture optimisation *affordable to
evaluate*. A version that cries "recapture everything" whenever the corpus is mid-migration is a version that
gets ignored, and then the cache-invalidation decision goes back to guesswork.

One thing came free with it. There were **two copies of the worker's hashed-file list plus a third derived by
regex** — `server.mjs`, `check-worker-code.mjs`, and `deploy-worker.mjs` parsing the second one's source. They
had to agree on contents *and order* or `/health.code` compares a different set than was deployed. Adding
`capture-pure.mjs` would have meant editing two lists by hand, which is precisely the shape that made this
check necessary in the first place, so the list is now one module (`worker-files.mjs`) that all three import —
and it contains itself, so editing it changes the hash.

## Reproducing the verification

```bash
npm run lint && npm run typecheck && npm test   # no worker, no venv, no network
npm run release:gate                            # signals -> rules -> acceptance -> judge quality
./packages/lab/scripts/action-dry-run.sh https://example.com "Complete the checkout"
npm run layers:compare -- '[["https://www.washington.edu/accesscomputing/AU/before.html","Apply now"]]'
```

`check-signals` is **red on this machine** and green on a fresh clone, because it reads the local corpus in
gitignored `runs/`, which is mid-migration (see the deferred table). It has no bearing on the shipped
artifacts: the model was trained and validated against a consistent corpus, and its report records that
dataset's sha256.
