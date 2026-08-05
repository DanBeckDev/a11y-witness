# Glossary

Terms this project uses in a specific way. Where a word has an ordinary meaning
that differs from ours, the difference is the reason it is here.

## Packaging and distribution (ADRs 0004–0008)

**evidence** — a capture's recorded output: what NVDA announced, what the sweeps
found, what the probes changed. Used as a mass noun throughout (`evidence:check`,
"did the evidence move?"). Also the name of `@a11y-witness/evidence`, the package
holding the capture wire types, the pure predicates over them, and the WCAG
criterion list. Chosen over `core`/`types`/`contracts` because it is the word the
project already uses.

**scorer** — the trained model: 27 KB of heads over a frozen MiniLM encoder, plus
the Python program that runs them. It produces **numbers**. Shipped as
`@a11y-witness/scorer`, where **the weights are the API**: a retrain is a major
version, because a consumer's pass/fail flips with no code change.

**judge** — the layer that turns scorer numbers *plus* deterministic rules into
WCAG findings with severities. It produces **findings**. Shipped as
`@a11y-witness/judge`. The distinction from *scorer* is load-bearing: `scoreCapture`
→ `findingsFromScores` is the seam, and conflating the two makes "the model changed"
and "the thresholds changed" the same sentence when they need different version
bumps.

**judge backend** — which engine produces the scores: `local` (our scorer, the
default everywhere), or `codex` / `anthropic` / `openai` for comparison. Never a
rented model by default.

**worker** — the Windows guest process that drives NVDA and serves `/capture`,
`/health` and `/diagnostics` over HTTP. Shipped as `@a11y-witness/nvda-worker`,
`"os": ["win32"]`. Named for the screen reader so a `voiceover-worker` can exist
later.

**fleet** — the host-side management of workers: leasing, pooling, host-capacity
measurement, health assessment, deploy and diagnosis. Runs on macOS/Linux and never
imports guidepup. Shipped as `@a11y-witness/worker-fleet`. A *worker* is one guest;
the *fleet* is everything that decides which guests run and whether they are well.

**lab** — the private, never-published workspace holding the eval harness and its
fixtures, the dataset pipeline, the gates, and the Python training programs.
Everything whose correctness depends on our corpus, our workers or our tuning.
`@a11y-witness/lab`. It is also the first consumer of every public API.

**isolation gate** — `npm pack` a package, install the tarball into an empty
directory **outside the repository**, and run its README's first example. The only
check that can see phantom dependencies, cwd-relative path resolution, and files
missing from `"files"`, because a workspace install resolves all three by accident.
Not trusted until it has been shown to fail (ADR 0007).

**capture protocol version** — `CAPTURE_PROTOCOL_VERSION`, a capture-cache key that
versions the *meaning of the evidence*. Deliberately **not** the worker package's
semver: a package major must not invalidate 2,122 cached captures, and a protocol
bump must not wait for a major.

**provenance** — two related things, both about "which instrument produced this".
On a capture: the cache key's inputs (page files, options, NVDA/Edge/guidepup
versions, Windows build, provision revision). On a scorer release: corpus, encoder
hash and thresholds, recorded in the changelog. On a published tarball: the npm
provenance attestation tying it to a commit here.

**layer** — which of the three coverage layers a finding belongs to: rule (axe),
deterministic screen-reader rule, or judged experience (ADR 0002). `layerOf` in
`@a11y-witness/judge/layers`.

## Capture and evidence

**probe** — a deliberate interaction during a capture that produces evidence a
read-through cannot: disclosure, forms, focus order, tables. Opt-in over the wire so
a capture never pays for evidence nobody asked for.

**sweep** — a quick-nav pass collecting one element type (headings, links,
graphics, lists, form fields) by repeatedly pressing that type's key.

**browse mode / focus mode** — NVDA's two input modes. In browse mode single letters
are navigation commands; in focus mode they are typed into the page. A focus change
into an editable control switches focus mode on, and it **sticks** — which is how
2,122 captures came to contain our own keystrokes.

**canary** — a page in `stability-gate.mjs` chosen because it *can express* a
specific known artefact. A canary that cannot reproduce the fault it guards against
proves nothing when it comes back clean.

**recoveries** — faults a worker papered over with a retry. The number that rises
while every capture still appears to succeed, so the one to watch.

**wedge** — a worker whose `/health` answers but whose every capture returns 429
because a previous capture hung and never released `busy`. Indistinguishable from a
dead machine from outside.
