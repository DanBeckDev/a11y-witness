# Local accessibility model plan

## Recommendation

Do not train a general-purpose language model for `a11y-witness`. The project
already has a structured signal: an ordered NVDA transcript, structural
navigation results, and interaction deltas. The useful local model should be a
small discriminative scorer that answers questions such as:

> Does this captured evidence support WCAG 2.4.4 Link Purpose?

That model can score a candidate finding, but it cannot invent one. The existing
deterministic rules should continue to own exact absence cases such as an
unnamed control or missing image alternative. A report explanation can then be
rendered from the captured evidence and a fixed WCAG template.

The model's input boundary is the screen-reader output only:

- `transcript`: the ordered NVDA announcements from browse-mode reading;
- `structure`: announcements produced by heading, landmark, and form-field
  quick-navigation;
- `interaction`: announcements after activating a disclosure, submitting a
  form, or activating a task-named control, including empty announcement deltas;
- screen-reader identity/version and capture metadata, for reproducibility.

The page HTML, DOM, CSS, accessibility tree, axe results, URL, and source code
must not be model features. `task` may be passed to a separate task-completion
judgment, but it must not be used to decide whether the announced experience
violates a WCAG criterion. In other words, the good/bad HTML pages are only
controlled instruments for producing paired screen-reader captures and labels;
they are not the training input.

This is a much smaller and safer problem than training a generator, and it fits
the current `applyGate` seam in `src/spike/verify-gate.ts`.

## Model shape

The first local experiment should use
[`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
as a frozen text encoder, followed by one binary head per observable criterion.
Its Hugging Face model page lists Apache-2.0 licensing, a 384-dimensional
embedding, and a `model.safetensors` file of about 90.9 MB. It also has ONNX
artifacts, which are a better inference format for this Node project than a
generative GGUF file.

The classifier input should be short evidence units rather than an entire page:

- one announcement or a small consecutive announcement window;
- one structural entry, such as a heading or form field;
- one interaction result, such as `control -> after`;
- the surrounding context needed for link purpose or heading quality.

The model produces criterion scores. Rules, thresholds, and provenance produce
the final finding. A local generative model can remain an optional explainer,
but it should not be the only component deciding whether a WCAG failure exists.

`MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli` is a reasonable stronger
comparison model: its card lists MIT licensing and a safetensors checkpoint,
but it is about 0.2B parameters and is materially heavier. The official
`microsoft/deberta-v3-small` repository currently exposes `pytorch_model.bin`
and `tf_model.h5` rather than a safetensors checkpoint, so it does not meet the
project's training-weight policy without a separately verified conversion.

## Data collection

The data must be paired at the page/component level and then captured with the
same NVDA worker used in production. HTML alone is not enough: the target is
the assistive-technology experience, not just the DOM. Every training row must
be exportable from a capture fixture without opening the page source.

Use these sources in this order:

1. **Existing project fixtures.** They are the first seed set and already have
   capture-shaped JSON and ground truth. Keep them as a regression set even
   after exporting training examples. Export only `transcript`,
   `structure`, `interaction`, and capture metadata; do not export the fixture
   page HTML.
2. **W3C WAI tutorials.** Extend the existing fresh-authored good/bad pairs for
   images, forms, page structure, tables, menus, carousels, validation, and
   notifications.
3. **W3C ACT test cases.** The WAI test-case index currently describes 1,132
   cases with `passed`, `failed`, and `inapplicable` outcomes plus WCAG
   mappings. Use the rule metadata to select candidates, recapture the relevant
   cases with NVDA, and retain only the resulting screen-reader observations
   this project can actually make. Do not feed ACT HTML into this model.
4. **W3C BAD (Before and After Demonstration).** It provides paired versions of
   multiple pages plus evaluation reports. Capture both versions with NVDA and
   use the reports only to establish labels. It is useful for end-to-end sanity
   checks, but it should not be the only source because a model can overfit to
   a famous demo.
5. **WAI-ARIA APG examples.** Use the functional patterns as good seeds and
   create one controlled mutation at a time: remove a name, remove a heading
   role, stop updating `aria-expanded`, or remove a status announcement. Capture
   both variants and keep the source example and mutation identity only in
   provenance.
6. **A11YBench and AccessGuru.** These are not sources for this model. They may
   be useful for evaluating or improving the separate static HTML/DOM layer,
   but their checker violations are not screen-reader evidence and must not be
   turned into labels for the NVDA model.

Synthetic generation is appropriate for augmentation, not ground truth. A
template may remove one known attribute, capture the result with NVDA, and label
the resulting failure because the mutation is known. An unconstrained model
generating an entire page does not provide a reliable label. Keep generated
paraphrases separate from the hand-authored and standards-derived capture set.

The repeatable collection path is implemented in src/training/. npm run
training:generate creates 45 controlled good/bad page pairs across independent
content families.
npm run training:capture sends each pair through the existing interactive NVDA
worker, and npm run training:export emits JSONL only for pairs whose expected
contrast was actually heard by NVDA. The exporter keeps the page source as an
instrument and provenance, never as model input. It stops rather than
fabricating transcripts when no Windows/NVDA worker is available.

## How much data is enough?

There is no responsible fixed number. The target depends on whether the model
is a frozen text encoder with a small classifier head, how many WCAG criteria
have separate heads, and how many independent page families are represented.
The current 45 pairs are a pipeline seed and coverage smoke test, not enough
to train or release the model.

Use these planning bands for the proposed frozen-encoder classifier:

| Stage | Per criterion | Purpose |
|---|---:|---|
| Pipeline smoke test | 20–50 labeled captures | Exercise export, rules, and evaluation code |
| First useful baseline | 100–200 violation + 100–200 clean captures | Compare a linear head against deterministic rules |
| Candidate model | 300–500 violation + 300–500 clean captures | Measure whether the model generalizes across page families |
| Release-quality target | 500–1,000+ violation + 500–1,000+ clean captures | Support a multi-criterion model with a real held-out set |

For the current eight-criterion matrix, that makes roughly 1,600–8,000
criterion-labelled records, depending on how safely clean controls can be
shared between heads. This is where the earlier “thousands” estimate comes
from. It is a planning target, not a claim that the model needs exactly that
many rows.

Do not count repeated captures of the same page as independent examples.
Repeat captures are valuable for measuring NVDA/version stability, but the
training and test split must be grouped by page family, template, source, and
mutation. Hold out at least 20% of families, with roughly 30–50 independent
test examples per criterion before trusting a metric. Use a learning curve to
decide whether adding data still improves validation performance; the
scikit-learn learning-curve API is designed for this comparison:
https://scikit-learn.org/stable/modules/learning_curve.html.

The bookctx references and W3C sources supply the coverage taxonomy and
authoritative mutation patterns. ACT, BAD, and APG help us find candidate
pages; their HTML or checker results still need to be recaptured through NVDA
before they become evidence for this model. A11YBench and AccessGuru remain
outside this dataset because their static checker findings are not spoken
screen-reader output.

## Split and labeling rules

- Split by page template, topic, and source—not by individual transcript lines.
  A good and bad version of the same template must never be split across train
  and test.
- Start with one primary criterion per mutation. Put defensible secondary
  criteria in `allow`, as the current eval does.
- Keep page-source provenance and capture labels separate. The source page is
  useful for reproducing a capture, but the model-training record is the
  screen-reader evidence plus its independently justified label.
- Keep an untouched, human-reviewed holdout. Do not tune prompts, thresholds,
  or rules against it.
- Record the capture environment: NVDA version, browser version, worker commit,
  task, and capture options. Announcement strings are version-specific.
- Measure per-criterion recall, false positives on clean pages, macro F1, and
  test-retest variation. A single aggregate accuracy number will hide the
  important failure modes.

## Safe model handling

For training checkpoints, download only allowlisted safetensors and metadata,
pin a Hub revision, record the repository owner, license, revision, and SHA-256
hash, and reject pickle-style weights. Do not enable `trust_remote_code` for a
model that does not need custom code. A model page's verification indicator is
useful provenance, but it is not a substitute for checking the publisher,
license, revision, files, and hashes.

The repository includes `scripts/verify-safetensors.mjs` to enforce the local
file-format rule. A converted ONNX or GGUF inference artifact may be used only
after the training checkpoint has passed the training check and the converted
artifact is recorded separately.

## Acceptance bar before replacing the current judge

The local model should first run as an opt-in gate alongside the current judge.
It should replace a model-generated finding only when it meets the pre-registered
holdout bar for that criterion, with zero false positives on the clean paired
pages. Until then, the current judge remains the fallback and the local model is
an independently measured signal.
