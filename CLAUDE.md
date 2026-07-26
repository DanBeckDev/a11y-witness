# CLAUDE.md — a11y-witness

Guidance for Claude Code (and humans) working in this repo.

## What this is

a11y-witness drives a **real screen reader (NVDA)** through real navigation and uses an AI judge (via local Codex — no metered API) to assess the lived assistive-technology experience: the judgment-based WCAG failures that rule scanners miss. It sits **alongside** axe-core (the rule/visual layer), not instead of it. See `README.md`, `PLAN.md`, and `docs/adr/`.

## Code conventions

We follow the applicable subset of *Clean Code* (Martin). It has two halves, enforced differently.

**Mechanical — enforced by ESLint (`npm run lint`); errors block CI:**
- Small functions that do one thing at a single level of abstraction; the top-level function reads as a top-down narrative (the Stepdown Rule). Gated by `max-lines-per-function` (70), `complexity` (15), `max-depth` (3).
- Few arguments, and **no boolean flag arguments** — bundle cohesive arguments into an object instead. Gated by `max-params` (4).
- **Never swallow an error** with an empty `catch {}` — record a diagnostic or rethrow with `{ cause }`. Gated by `no-empty`. (This codebase's whole diagnostics model exists because silent catches once hid an outage.)
- `no-magic-numbers` is a non-blocking **warning**: name a number when it is not self-explanatory (timeouts, budgets, limits); HTTP status codes and slice lengths are fine inline. This matches the book's G25 ("only when the value is not already self-explanatory").

**Judgment — not machine-checkable, so honor these by hand:**
- Does the function *really* do one thing? Extracting a helper whose name merely restates its code is not progress (the book's own test).
- Comments explain **why** — intent, consequences, non-obvious domain facts (NVDA quirks, the cursor-at-end gotcha, WCAG rationale). **Keep those.** Delete only comments that restate what the code already says. The book attacks noise and bad-code-compensating comments, and explicitly endorses intent/warning comments.
- Intention-revealing names; rename freely when a better name appears.
- **Do NOT import the book's Java-OO machinery** (Abstract Factory to hide switches, class-per-noun, ArgumentMarshaler-style hierarchies). This is a small functional TS/MJS pipeline; adding class structure here is over-engineering, the opposite of "scalable." Match the surrounding functional style.

## Verifying changes (there are no unit tests)

Verification is layered; pick the layers your change touches:
- `npm run lint` and `npm run typecheck` — must pass. **CI gates on both.**
- `npm run eval [-- <substring>]` — judge quality against labeled W3C fixtures. Needs a local Codex login, so it **cannot run in CI**; run it locally when you touch the judge, prompts, criteria, or fixtures. Headline today: 100% recall over the failure cases, ~2 false positives (the subjective 2.4.4/2.4.6 link/label criteria).
- **`src/capture/nvda/capture-core.mjs` only runs against NVDA on the Windows VM** — it has no local test. After changing it, deploy to the worker and re-validate a read-through + the disclosure probe + the form-submit probe: `node src/capture/nvda/capture-check.mjs`, run in the VM's console session. The VM capture is its test; the book's own rule is "refactor under test."
- **`capture-check` passing is necessary but not sufficient.** It asserts each probe *fired*, not what it heard, so it stays green while the evidence is garbage. Always eyeball the probe values: `disclosure-good` must yield `"expanded"` and `disclosure-bad` `""`; `forms-validation-good` must yield the announced error and `forms-validation-bad` `""`. If good and bad look identical, the capture is worthless regardless of the exit code.
- **Worker broken? Don't debug from first principles** — `docs/nvda-worker-runbook.md` has the error-string → real-cause table (the messages are misleading: `"NVDA not installed"` usually means a version mismatch, not a missing install), and `scripts/diagnose-nvda-worker.ps1` applies it automatically. `scripts/provision-nvda-worker.ps1` is the idempotent repair.
- **No worker to hand?** Build one locally — NVDA runs natively on Windows ARM64, so a scripted QEMU VM works on Apple Silicon: `docs/local-worker-vm.md` plus `scripts/local-worker/`. Validating capture changes through CI is a ~10-minute loop and should be the fallback, not the habit.

## Environment facts
- ESM throughout (`"type": "module"`). `.ts` for the control plane, `.mjs` for the capture worker (it runs under plain Node on the VM).
- The judge runs via the **Codex CLI** (subscription login), never the metered Anthropic API.
- Don't manually `taskkill nvda.exe` — let Guidepup own NVDA's lifecycle, or the speech-capture channel destabilises.
