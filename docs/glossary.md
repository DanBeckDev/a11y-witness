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

## Corpus and scoring

**case / pair** — one accessibility defect, as two pages that differ *only* by it: a
conformant `good` and a mutated `bad`. The label comes from the contrast, not from
anyone's opinion, which is why the pair must not differ in any other way.

**badSignal** — the machine-checkable statement of what a case demonstrates. It must
fire on the bad capture and stay silent on the good one; `check-signals` scores every
case on that and reports **BLIND** (it fires on neither) or **CONTAMINATED** (it fires
on both).

**furniture** — realistic page structure — links, headings, a labelled field, a data
table, a disclosure — injected **identically into both variants** of every case. It
exists to stop a feature being constant across a subtype's examples, and being
identical in both halves is what keeps the pair a controlled comparison.

**veto (free veto)** — a feature a trained head penalises at no cost, because it is 0
on every one of that head's training positives. Nothing in the data punishes the
weight, and no held-out split can either, since the split shares the corpus's
structure. `npm run scorer:shortcuts` counts them; there are 225.

**starvation** — the corpus-side view of the same thing, asked *before* a capture run:
which features will be constant across a subtype's positives, and therefore free to
veto? `npm run corpus:starvation` reads the case definitions and answers without
capturing anything.

**subtype** — the unit a head and a rule actually decide, finer than a WCAG criterion.
4.1.2 has three: `unnamed-control`, `state-change-silent`, `missing-role`. Ownership is
declared per subtype in `packages/lab/rule-ownership.json`, not per criterion — a
criterion can be part rule-decided and part head-decided, and 4.1.2 is.

**suppression** — where a rule owns a subtype, the trained head is dropped for it and
the rule's answer stands. This is why a head's blind spot is not automatically a
product blind spot, and checking which layer answers is the difference between a
component defect and a user-facing one.

**abstention / in-distribution floor** — the scorer declines on a capture whose nearest
training neighbour is further than the floor (currently 0.70 cosine), and reports those
criteria as **unchecked, not clean**. Chosen on a held-out calibration set, recorded
beside the value the training data would have implied.

**witnessable** — of a real page in the calibration corpus: its published failure would
fire a criterion the scorer has a head for, through a probe that actually runs on pages
we do not own. A page that fails only in ways this evidence cannot express adds a row to
the denominator and no signal.
