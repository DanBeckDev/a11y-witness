# `@a11y-witness/scorer`

The trained screen-reader accessibility scorer, as an **artefact**: 27 KB of binary heads over a frozen
MiniLM-L6-v2 encoder, plus the Python program that runs them and the training report that says what produced
them.

There is deliberately no `score()` function. Scoring runs in Python — torch, transformers, an 87 MB encoder —
so this package's job is to tell you *where the files are*, with absolute paths, and let you spawn the program
with an interpreter you chose.

```bash
npm install @a11y-witness/scorer
npx a11y-scorer-fetch-encoder          # 87 MB, once — not in the tarball
```

```js
import { scorerPaths, encoderPresent, scorerProvenance } from "@a11y-witness/scorer";
import { spawnSync } from "node:child_process";

const { scoreScript, encoderDir } = scorerPaths();
if (!encoderPresent()) throw new Error("run a11y-scorer-fetch-encoder first");

const result = spawnSync(process.env.A11Y_PYTHON ?? "python3",
  [scoreScript, "--capture-json", "capture.json"], { encoding: "utf8" });
```

Every path is resolved from `import.meta.url`, never the process cwd. That is not tidiness: the judge in this
project once resolved the scorer as `"scripts/score-screenreader-model.py"`, which works only when the cwd
happens to be the repo root — so the default backend could not run from anywhere else, and nobody noticed
because development always happens at the repo root.

## The weights are the API

This is why the model is a separate package rather than part of `@a11y-witness/judge`. A retrain that moves a
score flips a consumer's pass/fail **with no code change at all**, so a retrain is a *major* version bump. The
judge's code and the model's numbers change at different rates and for different reasons, and semver can only
express that if they version separately.

`scorerProvenance()` reads the training report so you can check before you spawn:

```js
scorerProvenance();
// { featureSchema: "screenreader-structured-v4", releaseEligible: true, encoderSha256: "...", trainedAt: "..." }
```

`releaseEligible` is the field that matters — the scoring program refuses a report not marked eligible unless
`--allow-ineligible` is passed.

## What is checked at load time, and why

The scorer refuses to run on a mismatch rather than scoring anyway:

| check | what it prevents |
|---|---|
| `FEATURE_SCHEMA_VERSION` in the safetensors metadata vs `screenreader_features.py` | scoring against features the heads were never trained on |
| encoder SHA-256 vs the training report | a different MiniLM producing different embeddings under the same name |
| `screenReader` on the capture | scoring a VoiceOver capture with NVDA-trained heads — it raises rather than guessing |

## The trainer is not here, on purpose

`screenreader_features.py` ships — it is the feature contract, and it is versioned *with* the weights it
describes, which is the whole reason it lives in this package. The training program does not.

Shipping a trainer would imply you can reproduce the training, and you cannot: the corpus is 1,061 captured
page pairs from a real NVDA instance and is not distributed. The AGPL obligation is met by the source being
public in the repository, not by putting it in the tarball. See `docs/adr/0004-package-boundaries.md`.

AGPL-3.0-or-later, unlike `@a11y-witness/evidence` (Apache-2.0). The contract is permissive so anyone can
interoperate; the trained model is not.
