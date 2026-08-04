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
| 98 cases whose `badSignal` cannot match their own generated page | Pre-existing inconsistency in `case-matrix.mjs`, exposed by regenerating pages; the local corpus in gitignored `runs/` is inconsistent as a result |
| Scoped cache invalidation | Two recaptures were measured as 65% unnecessary — a global `CAPTURE_PROTOCOL_VERSION` invalidates captures a fix could not have touched |
| ONNX export | Would drop torch (~529 MB) from the Action's setup |
| `provisionRevision` reads `"unstamped"` | Needs a deliberate pool-wide re-provision |

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
