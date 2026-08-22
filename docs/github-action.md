# The GitHub Action

Drive a real screen reader over a page in CI and report what it announced.

```yaml
runs-on: windows-2022          # NVDA is Windows-only; the action fails fast and says so otherwise
steps:
  - uses: DanBeckDev/a11y-witness@main
    with:
      url: https://example.com/checkout
      task: Complete the checkout with a saved card
      fail-on: never           # report first; gate when your team asks for it
```

> **Pin this deliberately.** There is no tagged release yet, so `@main` is the only ref that resolves —
> and it moves. If your CI must not change under you, pin the full commit SHA
> (`uses: DanBeckDev/a11y-witness@<sha>`), which is what GitHub itself recommends for third-party actions.
> A `@v1` tag is a release decision this project has not taken; see
> [ADR 0007](./adr/0007-versioning-and-release.md).

No API key. The default judge is this project's **own trained scorer** — 27 KB of heads shipped in the
repo, over an 87 MB encoder fetched at setup — so nothing leaves the runner and nothing is billed.

A copy-pasteable workflow is in [`examples/workflow.yml`](../examples/workflow.yml).

## Why it looks like this

**Composite, not Docker.** Container actions do not run on Windows runners, and NVDA needs Windows.

**`fail-on` defaults to `never`.** A tool that breaks builds the day it is installed gets uninstalled. One
that reports first, and fails when the team decides it should, gets adopted. Move to `blocker`, then
`serious`, as you fix what it finds. A severity means *that or worse*.

An **unrecognised** `fail-on` is a hard error rather than a fallback to `never`. A typo in a workflow file
that silently produces a permanently green check is the failure nobody notices, because green is exactly
what they expected.

**No rented judge by default.** `judge-backend: local` uses the scorer trained on this project's own
1,061-pair corpus. It scores **eight criteria** and is silent on everything else — narrower than an LLM,
and measured at zero false positives across 1,034 conformant records. `anthropic` and `openai` remain
available for broader, noisier coverage; the action refuses at once if you name one without a key or an
endpoint, rather than discovering it after a 20-minute capture.

The trained weights are committed deliberately, in `@a11y-witness/scorer`
(`packages/scorer/models/screenreader-scorer/`). Only the 87 MB encoder beside them is gitignored, and an
earlier version of that rule excluded the weights too — so the local judge worked only on the machine that
trained it, and a shipped action would have had **no model at all**.

The rule used to need `models/*` rather than `models/`, because git does not descend into an excluded
directory: a negation under it never fires, the file could only be added with `git add -f`, and a future
retrain would then silently not be committed. That shape is no longer needed for the weights — nothing
excludes an ancestor of `packages/scorer/models/screenreader-scorer` — but the lesson still applies to any
new ignore rule with a negation under it.

**One PR comment, updated.** `gh pr comment --edit-last --create-if-none` plus an HTML marker in the body,
so a busy PR gets one comment that changes rather than one per push. The comment step runs `always()`, so
the report still arrives when the check is failing — which is precisely when someone wants to read it.

**"Not run" is never rendered as "clean".** If you set `axe: false`, the report says the visual criteria
are *unchecked*, not that they passed. This is the one thing the tool must never get wrong, and it did:
the CLI's `--json` output emitted `ruleBased: []` for a skipped axe run while its text report correctly
emitted `null`, so the Action rendered unchecked contrast as "0 violations". Found by running the whole
thing end to end rather than by a unit test, and fixed at source so both output paths read one value.

## The setup steps are not boilerplate

Each is a fault this project already paid for. If you are tempted to simplify them, the reasons are inline
in `action.yml`:

| Step | Why |
|---|---|
| Install NVDA from this checkout, not `guidepup/setup-action` | The action predates the `@guidepup/setup` 0.24.0 CLI rewrite and installs the pre-0.29 layout, which guidepup ≥ 0.29 ignores. CI then fails with "NVDA is not supported", which reads like a missing install and is not one. |
| Disable the NVDA Speech Viewer | Guidepup ships it ON. Its focus event lands in the speech-log delta captured after activating a control, so an interaction probe records "NVDA Speech Viewer" instead of the page's response — and a check that only asserts the probe *fired* still passes. |
| Suppress Edge's first-run experience | A fresh profile shows a welcome/sign-in surface. On a page with no elements of a given type, NVDA's quick-nav escapes the document into that browser UI and produces phantom findings about Microsoft's own chrome. |
| Poll `/health.ready`, not `ok` | `ok` means only that the HTTP server is answering. A worker answered `ok` while NVDA could not start, which is how the capture pool's dominant failure hid for a day. |

## What is verified, and what is not

Verified locally: 12 tests over the renderer and the pass/fail policy; the exit contract exercised four
ways (default passes despite a blocker, a threshold fails, a typo refuses with exit 2, a missing result
file refuses rather than reporting a clean page); and a real end-to-end run — real NVDA capture, real
judge, `4.1.2 blocker` on a genuinely unnamed button — rendered through the Action's own reporter.

The default `local` backend has been run end to end on a real capture: real NVDA, our own scorer, no LLM
called — one `4.1.2` blocker at 0.998 confidence with `button` quoted as the evidence.

**Not verified: the `anthropic` backend.** This project deliberately has no metered key, so that path is
written to the SDK spec and unexercised. It is no longer the default, which is the point: the untested
path is now the opt-in one.

**Not yet verified on a real runner:** the local backend's setup step installs CPU torch and fetches the
encoder. That works locally and is expected to add 1-2 minutes; it has not run on a Windows runner. A
lighter ONNX path would remove torch entirely and is the obvious next optimisation.

## Testing it without spending runner minutes

```bash
npm run worker:ctl -- up
./packages/lab/scripts/action-dry-run.sh https://example.com "Complete the checkout"
FAIL_ON=blocker ./packages/lab/scripts/action-dry-run.sh ...      # check the exit contract
```

`act` cannot run this action — it is Docker/Linux and NVDA needs Windows — so the dry run executes the
action's own bash for the steps that carry the logic, with `RUNNER_TEMP`, `GITHUB_OUTPUT` and
`GITHUB_STEP_SUMMARY` set exactly as a runner sets them. It prints the summary a reviewer would read and
exits with the status the check would.

It cannot cover the Windows-only setup (NVDA, Speech Viewer, Edge policy, starting the worker) or
`gh pr comment`. Those setup steps are the least speculative part: `capture-regression.yml` already runs the
same commands on a real Windows runner for the same reasons.

One trap worth recording: run the action's snippets under **bash**, not zsh. `status` is a read-only
variable in zsh, so `status=0` fails with "read-only variable: status" — an artefact of the shell, not of
the action, which declares `shell: bash`.

## The demonstration: a real before/after pair

`projects.accesscomputing.uw.edu/au/before.html` and `after.html` — the University of Washington's
"Accessible University" demo, an expert-built inaccessible page and its accessible twin. Not ours, not
synthetic, and the closest thing to ground truth available in the wild. Both layers, LOCAL judge:

| | before (inaccessible) | after (accessible) |
|---|---|---|
| screen-reader layer | 1.1.1, 1.1.1, 4.1.2, **2.4.4**, **1.3.1** | **none** |
| axe | 1.4.3, 3.1.1, 1.1.1, 4.1.2, 1.4.1, 2.5.8 | **none** |

**Two findings only the screen-reader layer produced**, and the evidence is what a user hears:

```
2.4.4 Link Purpose      heard: "click here, link"
1.3.1 Info & Relationships   heard: "102 announcements, no heading among them"
```

axe reports neither, and not by oversight: its `link-name` rule asks whether a link HAS an accessible
name, and "click here" has one. Its heading rules are best-practice tagged. Both are judgements about the
*lived experience* — can you tell two links apart, can you skim the page — which a static DOM inspection
cannot make. Meanwhile axe found four things a screen reader cannot perceive at all (contrast, page
language, colour-only meaning, target size). Neither layer subsumes the other; that is ADR 0002's thesis
demonstrated on somebody else's pair rather than asserted on our own.

**The accessible version is clean on both layers.** That control matters more than the findings: the same
rules that fire five times on `before` fire zero times on `after`, which has 8 headings and descriptive
link text. Across the 1,061 conformant pages of the corpus the new 2.4.4 rule fires **0** times, and 38
times on their inaccessible twins.

One more thing this pair exposed, recorded because it changes what can be claimed: **the trained scorer
contributed nothing here.** It scored every criterion below 0.002 on the inaccessible page — 2.4.4 at
4.5e-12 — while scoring 0.997 and 0.985 on the corpus pages it was trained on. Every finding above came
from the deterministic rule layer. The scorer is sharp on its own distribution and silent off it, so
`judge-backend: local` is currently the rule layer doing the work on real sites. Retraining on the same
synthetic corpus will improve calibration, not generalisation.

## Tested against real sites in the wild

Run locally through `action-dry-run.sh`, full setup, both layers, LOCAL judge — no LLM, no key.

**`w3.org/WAI` — the W3C's own accessibility site.** 143 announcements; 19 headings, 15 landmarks, 42
links, 10 form fields captured. **Zero findings**, and not marginally: the highest score was 0.049 against
a 0.4 threshold. A false positive here would have been damning.

**`news.ycombinator.com` — a real site, not built for accessibility.** 151 announcements, 3 findings, all
true positives: the search box is announced as a bare `edit` with no label (3.3.2, 4.1.2) and the logo has
no alt text (1.1.1). The 1.1.1 was caught by the `"missing image descriptions"` hint, i.e. by the fix for
NVDA's nondeterministic `"unlabeled"` prefix.

The same run with `axe: true` shows why there are two layers rather than one:

| criterion | screen-reader layer | axe |
|---|---|---|
| 1.1.1 image-alt | yes | yes — **the layers agree** |
| 4.1.2 label | yes | yes — **agree** |
| 1.4.3 contrast | — | yes — a screen reader cannot perceive it |
| 2.5.8 target size | — | yes — likewise |
| what a user actually HEARS (`edit`, and nothing else) | yes | axe cannot say this |

They corroborate where they overlap and each covers what the other structurally cannot. That is ADR 0002's
thesis, demonstrated rather than asserted.

Two rough edges found by doing this, both recorded rather than hidden:

- The prose used to state a count (`"1 confirmed failure(s)"`) above a table listing **three**, because
  `judge()` appends the rule layer's findings AFTER the local judge writes its summary. The summary now
  carries no number: the renderer counts the findings, so there is one source of truth.
- `taskCompletable` is derived from "did anything score as a blocker", because this layer has no head for
  task completion. On that site that reads `No` off an unlabelled search box, though the stated task
  ("read the top story") does not need search. It is a coarse proxy and is documented as one.

## What `task` actually does

Less than its name suggests, and worth knowing before you agonise over the wording.

| setting | does the task matter? |
|---|---|
| `probe-forms: true` (**the default here**) | **Yes — it changes the capture.** A button whose announced name shares a meaningful word with the task is activated, and what the screen reader says next is recorded. The word match is the safety guard: "show only bags" activates a *Bags* button, never *Delete account*. Asserted in `probe-choice.test.ts`. |
| `judge-backend: anthropic` / `openai` | **Yes — it changes the verdict.** The LLM reads it and answers "could a screen-reader user finish this?" |
| `judge-backend: local` (default) | **Not for the verdict.** The scorer has no head for task completion and never sees the task — `docs/local-model.md` bars it as a model feature. The report deliberately does not claim your task was completable. |

So on the defaults the task **does** shape what gets captured, because `probe-forms` is on: it selects
which control is operated, and therefore whether 3.3.1 and 4.1.3 evidence exists at all. It does not
shape the judgement, because the default scorer never reads it.

This section previously said the task was inert on the defaults, which was true when `probe-forms`
defaulted to false. It changed deliberately: reviewing a page means checking what is on it, and an error
message nobody hears is only reachable by submitting. **The CLI still defaults it off**, because a
workflow tests your own application while `witness <url>` can be aimed at anyone's — see ADR 0002 and
`probe-choice.test.ts`, which asserts both defaults.

## Outputs

| Output | Use |
|---|---|
| `findings` | Count of lived-experience findings. |
| `task-completable` | Whether the judge thinks a screen-reader user could finish the stated task. |
| `result-json` | Path to the full result, including the transcript. Worth uploading as an artifact — the transcript is the evidence behind every finding. |
