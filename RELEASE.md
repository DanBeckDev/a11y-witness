# Release status

What is verified, what is not, and what is deliberately deferred. Written to be read before shipping and
believed afterwards — every line is a measurement, not an intention.

## Verified at this commit

Run on a **clean checkout of `HEAD`**, which is what CI and a consumer see:

| check | result |
|---|---|
| unit tests | **344 / 344 pass** |
| typecheck | clean |
| lint | 0 errors (303 warnings, all `no-magic-numbers`, non-blocking by design) |
| `rules:gate` | **PASS** — every rule-owned subtype exact on real captured evidence, **0 false positives across 1,003 conformant records** |
| held-out acceptance | **PASS** — `"passed": true`, no failure reasons |
| `eval:gate` (judge quality) | **PASS** — recall 90%, **0 false positives on conformant pages**, 48 failure-case runs |
| shipped model | `releaseEligible: true`, `modelReleaseEligible: true`, **0 warnings** |

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
  `scripts/action-dry-run.sh`, which runs the Action's own bash locally against a live worker. The
  Windows-only setup steps (NVDA install, Speech Viewer, Edge policy) are exercised by
  `capture-regression.yml` on a real runner for the same reasons. `act` cannot help — it is Docker/Linux
  and NVDA needs Windows.
- **`msEdgeImageMagnifyUI`** in `--disable-features`. The name is taken from Microsoft's documented *enable*
  flag and is unverifiable through CDP (`SystemInfo.getFeatureState` answers "Unknown feature" even for
  flags that demonstrably work). It is a belt beside a verified brace — `pointer.mjs` is what actually
  closes that hole.

## Known limitations, stated plainly

- **The trained scorer does not generalise to real pages yet.** It scores 0.997 on a page from its own
  distribution and **≤ 0.002** on the UW inaccessible page. The cause is measured: the training corpus has
  a median of 0 links and a maximum of 1, where real pages carry 41–47, so the model's structured features
  sit 10–40× outside its fitted range. **On real sites the deterministic rule layer is what finds things**,
  including both findings above. The fix is a rescaled corpus, parked on branch `dataset-rescale`.
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
| Corpus rescale for generalisation (branch `dataset-rescale`) | ~10 h of capture; improves the model, changes nothing that ships |
| **418 of 1,061 cases have STALE captures**, so `release:gate` fails at its first check | ~2.9 h of recapture (836 captures at the measured 12.4 s) on **one** worker — two halves reliability. Nothing that ships reads `runs/`; the scorer's weights are committed and its eval fixtures are tracked, so this blocks a *gate*, not the product. Deliberately out of scope for the packaging work (5 Aug). |
| 98 cases whose `badSignal` cannot match their own generated page | Pre-existing inconsistency in `case-matrix.mjs`, exposed by regenerating pages; the local corpus in gitignored `runs/` is inconsistent as a result |
| Scoped cache invalidation | Two recaptures were measured as 65% unnecessary — a global `CAPTURE_PROTOCOL_VERSION` invalidates captures a fix could not have touched |
| ONNX export | Would drop torch (~529 MB) from the Action's setup |
| `provisionRevision` reads `"unstamped"` | Needs a deliberate pool-wide re-provision |
| `scripts/check-screenreader-hardening.py` was also untracked | Now committed; backs `npm run training:hardening`, which is in no gate, so it had no effect on any recorded result |
| **CI's `lint` job is RED** — 6 test files fail on the runner | See below; the fix is understood and is a refactor I chose not to attempt under release pressure |

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

## The one thing that is red, and exactly why

`.github/workflows/lint.yml` fails on 6 files under `src/capture/nvda/`. The cause is one line:

```
Error: No available supported screen readers
```

`@guidepup/guidepup` **throws at import time** where no screen reader exists. CI is Linux, so merely
importing `capture-core.mjs` fails — and every test that imports it to reach a *pure* helper
(`sweepStepFromSpeech`, `dedupeKey`, `phraseAction`, `crossCheckStructure`, `elementsListRowName`,
`failIfScreenReaderIsMute`, `edgeArgs`) dies with it. Node reports these per FILE — "test failed" — which
reads like broken logic rather than an unavailable dependency.

Three things worth being straight about:

- **It predates this release.** CI was already failing this way on 1 Aug with 2 files. Test files added
  since took it to 6, because more of them import `capture-core` to reach pure logic.
- **The assertions themselves pass.** All 344 run green on a clean checkout on macOS, where guidepup
  imports fine. Nothing here indicates a defect in the code under test.
- **The fix is known:** move those pure functions into a `capture-pure.mjs` with no guidepup in its import
  graph, and have `capture-core` re-export them. I attempted it, broke `capture-core` (a 2,000-line module
  with no local test — it only runs against real NVDA on the VM), and reverted rather than ship a
  half-finished refactor of the capture path. It is a contained job with a clear acceptance test — the same
  6 files passing with `guidepup` absent from the graph — and it should be done deliberately, not at the
  end of a long day.

## Reproducing the verification

```bash
npm run lint && npm run typecheck && npm test   # no worker, no venv, no network
npm run release:gate                            # signals -> rules -> acceptance -> judge quality
./scripts/action-dry-run.sh https://example.com "Complete the checkout"
npm run layers:compare -- '[["https://www.washington.edu/accesscomputing/AU/before.html","Apply now"]]'
```

`check-signals` is **red on this machine** and green on a fresh clone, because it reads the local corpus in
gitignored `runs/`, which is mid-migration (see the deferred table). It has no bearing on the shipped
artifacts: the model was trained and validated against a consistent corpus, and its report records that
dataset's sha256.
