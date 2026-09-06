# ADR 0032: The trained scorer runs as a Python subprocess, chosen by `A11Y_PYTHON`, not in-process JS

## Status

Accepted. The boundary is implemented (`@a11y-witness/scorer`'s `spawnSync`, `local-judge.ts`) and its
trust implications are documented in `SECURITY.md`, but the decision to draw the boundary there — rather
than in-process, or as a compiled artefact — was never recorded on its own; ADR 0004 and ADR 0012 both
treat "a Python venv, a scorer model" as a given input to the package/credential splits they decide, not
as something they decide themselves.

## Context

The judge's default backend (`JUDGE_BACKEND=local`) scores a capture with a small trained model: 27 KB of
linear heads over a frozen MiniLM-L6-v2 encoder. Training needs the full PyTorch stack; running the trained
heads does not, once the encoder is exported to ONNX (`docs/history-2026-08.md`, "Done 2026-08-09: ONNX
inference"). That change alone measured torch at 400 MB and 102 s of every cold CI run — 34% of it — and
replaced it with ONNX Runtime plus numpy for scoring, while torch stayed a training-only dependency that
never runs in CI.

`packages/judge/src/verify-gate.ts` (an optional, off-by-default discriminative gate) already proves a
JS-native path is possible in this codebase: it lazy-loads `@huggingface/transformers` (transformers.js,
ONNX-in-JS) and runs a small NLI model entirely in-process, no subprocess, no venv. That option exists and
is used — for the secondary gate, not the primary scorer.

## Decision

**The primary scorer runs out-of-process, in Python, chosen by the caller.** `@a11y-witness/scorer`
deliberately ships no `score()` function — its own README states this outright: "Scoring runs in Python —
torch, transformers, an 87 MB encoder — so this package's job is to tell you *where the files are*... and
let you spawn the program with an interpreter you chose." The package resolves paths (`scorerPaths()`,
`encoderPresent()`, `scorerProvenance()`); the caller (`local-judge.ts`) does
`spawnSync(process.env.A11Y_PYTHON ?? "python3", [scoreScript, ...])`.

`A11Y_PYTHON` — and its siblings `A11Y_SHADOW_PYTHON`, `A11Y_SCORER_MODEL` — exist so a consumer can point
the same code at a different venv (a different torch/transformers version, or a candidate model under
training) without changing the interpreter resolution logic. `SECURITY.md` records the cost of that
freedom plainly: `A11Y_PYTHON` is executed, "equivalent to running arbitrary code as the invoking user",
and both the CLI and the Ansible job interface treat it as trusted-input-only (the job interface never
forwards a caller's environment for exactly this reason).

## What was actually rejected, and what was not decided here

**Torch for inference was rejected, and it is measured, not argued.** The ONNX migration is the one place
this boundary was genuinely reconsidered and changed: same weights, same features, verified at three
levels (encoder outputs within 2.3e-07, scores within 1.12e-08, `npm run eval`/`release:gate` unchanged) —
so the swap is proven evidence-neutral, and torch is now training-only.

**Moving inference further, into JS via `onnxruntime-node` or `transformers.js` — eliminating the Python
subprocess and the venv entirely for the shipped scoring path — was not found decided anywhere**, and this
ADR does not invent a reason it was rejected. `verify-gate.ts` shows the codebase already has the pieces
(`@huggingface/transformers`, lazy-loaded, optional) and uses them for a smaller, secondary model; nothing
in the repo states why the same approach was not extended to the primary heads. The plausible reasons —
`onnxruntime-node`'s native binding surface across platforms, or simply sequencing (the Python path shipped
first and nothing has since revisited it) — are this ADR's own inference, not a recorded decision, and are
named as such rather than presented as history.

## Consequences

- Running the local judge backend needs a Python venv with torch/transformers/onnxruntime/safetensors
  installed — `npm run eval`, `npm run eval:gate` and `release:gate`'s judge-quality stages all state they
  "cannot run in CI" for exactly this reason, and depend on `.venv` being present.
- `A11Y_PYTHON` is a real code-execution surface and must be treated as trusted input, never taken from a
  request or an untrusted caller — `SECURITY.md`'s scope section already draws this line.
- The scorer package staying dependency-light (paths and provenance only, no torch/onnx pulled into
  `@a11y-witness/scorer`'s own `package.json`) is what lets it be installed and inspected (`scorerProvenance()`)
  without needing the interpreter it will eventually be spawned with.

## What would falsify this

If a future measurement shows the same heads scoring correctly and fast enough under `onnxruntime-node` or
`transformers.js` in-process — the way `verify-gate.ts`'s NLI model already does — the case for keeping a
subprocess boundary at all weakens to "we haven't done the migration yet" rather than "in-process JS cannot
do this here", and this ADR's status should change to superseded rather than silently ignored.
