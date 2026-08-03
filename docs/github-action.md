# The GitHub Action

Drive a real screen reader over a page in CI and report what it announced.

```yaml
runs-on: windows-2022          # NVDA is Windows-only; the action fails fast and says so otherwise
steps:
  - uses: a11y-witness/a11y-witness@v1
    with:
      url: https://example.com/checkout
      task: Complete the checkout with a saved card
      fail-on: never           # report first; gate when your team asks for it
```

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
1,061-pair corpus. It covers **eight criteria** and is silent on everything else — narrower than an LLM,
and measured at zero false positives across 1,034 conformant records. `anthropic` and `openai` remain
available for broader, noisier coverage; the action refuses at once if you name one without a key or an
endpoint, rather than discovering it after a 20-minute capture.

The trained weights are committed deliberately (`models/screenreader-scorer/`). `models/` is otherwise
gitignored, and the first version of that rule excluded the scorer too — so the local judge worked only on
the machine that trained it, and a shipped action would have had **no model at all**. Note the pattern is
`models/*` rather than `models/`: git does not descend into an excluded directory, so a negation under it
never fires and the file could only be added with `git add -f` — meaning a future retrain would silently
not be committed.

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

## Outputs

| Output | Use |
|---|---|
| `findings` | Count of lived-experience findings. |
| `task-completable` | Whether the judge thinks a screen-reader user could finish the stated task. |
| `result-json` | Path to the full result, including the transcript. Worth uploading as an artifact — the transcript is the evidence behind every finding. |
