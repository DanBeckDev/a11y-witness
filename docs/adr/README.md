# Architecture decision records

One file per decision, numbered in the order it was taken. An ADR records **what was decided, what it cost,
and what would falsify it** — so a future reader can tell a considered choice from an accident, and knows
which measurement to repeat before overturning it.

Several of these were changed by later evidence. That is recorded *in the original*, as a dated update,
rather than by quietly editing the decision — a decision record that only shows the final answer cannot tell
you which arguments have already been tried.

## Index

| # | decision | status |
|---|---|---|
| [0001](./0001-capture-architecture.md) | Capture workers as network services, Windows/NVDA first | accepted; judge half substantially proven |
| [0002](./0002-layered-coverage.md) | Layered coverage — rule-based (axe-core) **plus** lived experience | proposed; axe layer shipped |
| [0003](./0003-testing-and-distribution.md) | Reproducible testing in CI, GitHub Action as primary distribution | accepted |
| [0004](./0004-package-boundaries.md) | Package boundaries and per-package public API | accepted |
| [0005](./0005-workspaces-build-and-linking.md) | npm workspaces, per-package `tsc` build, semver-range linking | accepted |
| [0006](./0006-naming-registry-and-licensing.md) | Naming scheme, public npm as registry, and the licence split | accepted |
| [0007](./0007-versioning-and-release.md) | Independent semver via Changesets, and the isolation gate | accepted |
| [0008](./0008-what-stays-internal.md) | What is deliberately **not** split, and what stays internal | accepted |
| [0009](./0009-dataset-tiers.md) | Split the corpus into tiers rather than making every page realistic | accepted 2026-08-06 |
| [0010](./0010-real-page-calibration-corpus.md) | A real-page calibration corpus, and why one asset unblocks three things | accepted 2026-08-08; measured 2026-08-21 |
| [0011](./0011-task-journeys.md) | Task journeys — testing what a user is trying to DO | accepted as direction, not scheduled for 1.0 |
| [0012](./0012-control-plane-split.md) | Split fleet CONTROL from the LAB, along the credential boundary | accepted |
| [0013](./0013-lab-job-control.md) | Drive long lab jobs through Ansible and systemd, not a remote shell | accepted 2026-08-21 |
| [0014](./0014-idle-workers-power-themselves-down.md) | Idle workers power themselves down, and only they may decide it | **proposed, not implemented** — the wake gate passed; the power draw is unmeasured |
| [0015](./0015-one-defect-per-page-taught-the-scorer-to-veto.md) | One defect per page taught every head to veto on other criteria's evidence | accepted 2026-08-22 |
| [0016](./0016-publishing-the-screen-reader-evidence.md) | Publish the screen-reader evidence, not the pages, and not the synthetic corpus | accepted 2026-08-23 |
| [0017](./0017-the-rule-reports-the-criterion-it-already-decides.md) | A rule that decides evidence must report every criterion that evidence fails | accepted 2026-08-23 |
| [0018](./0018-a-placeholder-label-is-not-witnessable-by-a-screen-reader.md) | A placeholder-only label is not witnessable by a screen reader, and belongs to axe | accepted 2026-08-23 |
| [0019](./0019-a-synthetic-holdout-cannot-falsify-a-synthetic-assumption.md) | A synthetic hold-out cannot falsify a synthetic assumption; real pages are the only unshared measurement | accepted 2026-08-24 |
| [0020](./0020-unexamined-is-not-failing.md) | Unexamined is not failing: evidence completeness gates absence claims | accepted 2026-08-24 |
| [0021](./0021-the-layer-that-decides-must-be-the-layer-allowed-to-claim.md) | The layer that decides a subtype must be the layer allowed to claim it | accepted 2026-08-24 |
| [0022](./0022-zero-false-positives-on-our-own-corpus-is-not-a-promise.md) | Zero false positives on our own corpus is not a promise | accepted 2026-08-24 |
| [0023](./0023-a-consent-banner-is-part-of-the-page.md) | A consent banner is part of the page, and the capture must say so | accepted 2026-08-29 |
| [0024](./0024-a-form-is-configured-with-states-not-values.md) | A form is configured with STATES, not values | accepted 2026-09-02 |
| [0025](./0025-the-capture-cache-key-describes-evidence-not-code.md) | The capture cache key describes the evidence, never the code that produced it | accepted |
| [0026](./0026-async-capture-with-a-client-minted-id.md) | Async capture with a client-minted idempotency key, not a long-held connection | accepted 2026-08-29 |
| [0027](./0027-bare-metal-fleet-replaces-local-vm-capture.md) | The bare-metal fleet replaces local UTM VMs as the capture path | accepted |
| [0028](./0028-recovery-keyed-on-fault-codes.md) | Recovery is keyed on fault codes, never on message text | accepted |
| [0029](./0029-two-tier-readiness-ready-vs-ok.md) | Two-tier readiness — dispatch on `ready`, never on `ok` | accepted |
| [0030](./0030-fleet-code-parity-is-a-precondition-not-a-cache-key.md) | Fleet code-version parity is a deploy precondition, never a capture cache key | accepted |
| [0031](./0031-the-worker-ships-plain-mjs-with-no-build-step.md) | The capture worker ships as plain, unbuilt `.mjs`; the control plane compiles from `.ts` | accepted |
| [0032](./0032-the-scorer-runs-as-a-subprocess-in-a-python-venv.md) | The trained scorer runs as a Python subprocess, chosen by `A11Y_PYTHON`, not in-process JS | accepted |
| [0033](./0033-guidepup-exact-pin-is-evidence-not-dependency-hygiene.md) | guidepup is pinned to an exact version because its version is evidence, not a dependency choice | accepted |
| [0034](./0034-the-speech-channel-is-a-socket-forced-to-fail-loud.md) | The speech channel is a raw TLS socket, and recovery forces it to fail loud rather than restarting NVDA | accepted |
| [0035](./0035-the-browser-preset-is-evidence-not-configuration.md) | The browser preset is evidence, not configuration — and never falls back | accepted |
| [0036](./0036-the-layer-model.md) | The layer model — a source of evidence, and which packages may claim one, before the `a11ign` rename | accepted |

## If you read only one

**[0015](./0015-one-defect-per-page-taught-the-scorer-to-veto.md)** is the clearest example of what these
records are for. It starts from a single missed page, follows three whys into a measured cause — the same
announcement scoring 0.924042 on two pages and 0.452519 on a third — and ends with a corpus change and a
gate. It also corrects an inference in 0010 rather than leaving the older record to be believed.

## Writing a new one

Number it next, and keep the shape the existing ones use: **Context** (what forced a decision), **Decision**
(what, in the imperative), **Consequences** (including the ones you do not like), **Alternatives rejected**
(with the reason each was rejected — this is the section future readers actually use), and where it applies,
**what would falsify this**.

Prefer a measurement to an argument. If a number here is not measured, say so in the sentence that uses it.
