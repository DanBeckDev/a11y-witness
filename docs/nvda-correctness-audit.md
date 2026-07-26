# NVDA correctness audit

A systematic review of how the capture worker drives NVDA, checked against the
official [NVDA user guide](https://download.nvaccess.org/releases/2026.1.1/documentation/userGuide.html)
(2026.1.1). Scope: the screen-reader interaction surface — `src/capture/nvda/capture-core.mjs`
and the Guidepup usage. The judge, eval, axe, and CLI never touch NVDA and are out of scope.

Done 2026-06-26, four parallel reviews (reading, quick-nav/browse mode,
interaction/focus mode, setup/config), each cross-checking the guide against the
actual code; material findings were re-verified on the live NVDA worker.

## Verdict

**No incorrect or unsafe NVDA usage was found.** The interaction model is
well-grounded in the guide: line-by-line reading is a correct in-order read,
bidirectional quick-nav sweeping is sound, the no-movement stop guard is more
robust than matching NVDA's version-variable "no next heading" wording, and the
focus-mode handling (Escape back to browse mode, Ctrl+Home to anchor, Enter to
activate buttons) is documented-correct. The fixes below are robustness,
determinism, and accuracy refinements — not corrections of wrong behaviour.

## Findings and actions

### Reading (linear read-through)
- **Correct:** line-by-line `nvda.next()` is a valid in-document-order read; reading the first line in place before the first move is right (NVDA moves-then-reads); the repeat/wrap stop heuristics are sound because the guide documents *no* end-of-document announcement to match on.
- **Fixed (should-fix):** the read-through now anchors at the top first (`anchorToTop()` — Escape → browse mode, Ctrl+Home → top), so an auto-focusing page can't leave the read starting mid-page or inert in focus mode. (This was reverted once when the Edge launch was uncontrolled — the early keystrokes surfaced the browser start page — and re-applied after the `--app` Root-1 fix made it safe.)

### Quick navigation / browse mode
- **Correct:** sweeping both directions reaches every element regardless of cursor position (quick-nav has no documented wrap); the no-movement guard is the right primary stop signal.
- **Fixed (integrity):** the comment claiming NVDA's "F" reaches `<button>`s that "B" misses was stated as fact; the guide treats "F" and "B" as distinct co-equal commands and documents no such gap. Re-worded to a build-specific *observation* (defend-or-retract).
- **Fixed (robustness):** quick-nav was escaping a heading-less document into Edge's own UI (a CI capture read the image-viewer/"Close banner" controls). Root fix: launch Edge as a chromeless `--app` window — no tab strip, address bar, toolbar or banners, only the target page, so there is nothing out-of-document to reach. Plus anchoring before the structural sweep.
- **Backlog:** NVDA's Elements List (`NVDA+F7`) is the guide's purpose-built bulk enumeration for links/headings/form-fields/buttons/landmarks — a cleaner long-term path than repeated quick-nav (the dialog must be read via list navigation, not `lastSpokenPhrase`); not a blocker.

### Interaction / focus mode
- **Correct:** `nvda.act()` (Enter) is the documented way to activate a button-type control (disclosure, submit); Escape "switches back to browse mode if focus mode was previously switched to automatically" — exactly our case; capturing the `spokenPhraseLog` delta (not just the last phrase) is good practice. Auto focus mode triggers only for complex-interaction controls (edit fields / combos), so our unconditional Escape before a re-scan is harmless when not needed.
- **Note (comments added):** Ctrl+Home is a standard Windows caret key browse mode passes through, not an NVDA command; Enter ≡ Space for buttons. If a future probe toggles a checkbox/radio, use Space; if it types into a field, use focus mode deliberately.

### Setup / portable copy / configuration
- **Correct:** driving desktop (Win32) Edge avoids the one browse-mode-relevant portable-copy restriction (no browse mode in Windows Store/UWP apps); focusing the window before `nvda.start()`, the startup health check, and letting Guidepup own NVDA's lifecycle (`nvda.stop()`, never `taskkill`) are all sound.
- **Fixed (determinism):** the setup recipe now pins the NVDA install dir instead of defaulting to `%TEMP%` (which the OS can clean, forcing a silent reinstall with newer defaults).
- **Fixed (determinism):** "Automatic say all on page load" is on by default — NVDA begins auto-reading the page on load, which can race our line-stepping. `anchorToTop()`'s Ctrl+Home (now applied before the read-through) moves the caret, which cancels that auto-read, so our stepping is the only source of speech.
- **Backlog:** for cross-version reproducibility, pin a known NVDA settings profile (symbol level, element-reporting toggles, "Report live regions", auto-focus-mode) rather than inheriting Guidepup's defaults. Note: the relevant live-region setting is **"Report live regions"** (Document Formatting, on by default) — *not* "Report dynamic content changes" (`NVDA+5`), which governs terminals/chat. The guide's wording that NVDA reports only *"some"* dynamic web content corroborates why live-region capture is inherently unreliable (see Phase 1b).

## Net result

The verdict — no incorrect or unsafe NVDA usage — is the headline. A follow-on
root-cause pass (the "three whys") then traced the *recurring capture* problems
to three roots and fixed them:

1. **We didn't control or verify the browser NVDA reads.** Fixed by (a) the
   capture-integrity net — every capture must contain a signature proving it
   read the target page, else it fails loudly; (b) launching Edge as a
   chromeless `--app` window so there's no browser UI to wander into; (c)
   verify-and-retry — re-capture until the page is confirmed, since browser
   focus on a shared CI desktop is inherently racy. The integrity net caught the
   wrong-content reads the old test silently passed (a "0 headings" that was
   really an empty/chrome capture).
2. **We operated NVDA without establishing a known state.** Fixed by
   `anchorToTop()` (Escape → browse mode, Ctrl+Home → top) before the
   read-through, the structural sweep, and the post-submit re-read — re-applied
   safely once `--app` controlled the environment.
3. **We captured transient speech instead of persistent state.** Mitigated:
   the post-submit field re-read uses durable `aria-invalid` state, the judge
   weighs both signals as positive evidence, and verify-and-retry guarantees we
   read the right page first.

The capture-regression gate is green and now *reliable* (it re-captures past the
CI focus race rather than flaking). Remaining backlog (Elements List
enumeration; pinned NVDA settings profile; product-level verify-and-retry in the
control plane) is tracked in `PLAN.md`. This whole pass is another argument for
reproducible CI: the VM's established Edge profile hid every one of these.

---

# Second root-cause pass (2026-07-26): capture under batch load

The first pass reviewed correctness against the user guide, one capture at a time. The
first **batch** workload — a training-dataset run of 45 page pairs, 90 captures back to
back — exposed problems a single capture cannot show. Three whys on each, per the practice
established above.

## The observations

- 18 of 72 captures (**25%**) came back as `"blank", "blank"` instead of the page and had
  to be re-captured.
- Each capture took **50s, of which only 13s was work** (`readThrough` 6.2s +
  `structural` 6.8s). The rest was setup and teardown, 90 times over.
- The worker reported **success on all 18 failures**. Across the 73 captures it kept,
  `afterStart.lastSpoken` was empty **73/73** and `windowsActivate ok:false` fired **0**
  times.

## Root A — a timer stood in for a state check

**Why did NVDA announce "blank"?** It was reading an Edge window that was not showing the
target page.

**Why was the wrong window in front?** Readiness was inferred from a fixed 12-second sleep
after launching Edge. Under load that is not always enough — and because captures run back
to back, the *previous* capture's Edge could still be terminating when the next one
launched, so `windowsActivate` could attach to a dying window.

**Why infer readiness from a duration at all?** Because nothing verified that the document
was actually up. The first pass fixed *which* browser NVDA reads (Root 1, the chromeless
`--app` window) and *what state* the cursor starts in (Root 3, `anchorToTop`), but left the
question "is the page there yet" answered by a clock.

**Root: a duration was used as a proxy for a state.** This is a recurrence of the first
pass's Root 1/3 rather than a new problem — those fixes were incomplete in a way that only
a batch run makes visible.

*Fixed:* poll for the window instead of sleeping; ask NVDA to name the document and
re-focus until it can (`waitForDocument`); wait for Edge to actually exit before the next
capture starts, which is now an event because the worker owns the process.

## Root B — a one-shot contract inside a long-lived server

**Why 37 seconds of overhead per capture?** Fixed sleeps (12s + 3s) plus starting and
stopping NVDA (10s + 3s), every time.

**Why per capture?** `captureWithNvda` owns the whole lifecycle: launch the browser, start
the screen reader, tear both down before returning.

**Why is that still the shape when the worker serves 90 captures in a row?** Because the
HTTP worker was built *around* the existing one-shot function without revisiting where the
lifecycle boundary belonged. "Do everything and leave nothing running" is the right
contract for a CLI invocation and the wrong one for a server, and nothing forced the
question until a batch run made it cost 16 minutes.

**Root: a decision that was correct in its original context was carried into a new one
unexamined.** Same shape as Root A.

*Fixed:* NVDA persists across captures (recycled every 25, `A11Y_REUSE_NVDA=0` to revert),
and the startup settle is skipped when it was already running. Speech logs are cleared per
capture so a reused capture starts in the same state as a cold one.

## Root C — the instrumentation was never validated

**Why did the worker report success on 18 failed captures?** Nothing it recorded could tell
the difference.

**Why not?** `afterStart.lastSpoken` was sampled before anchoring, when NVDA has
legitimately not spoken yet — so it read empty on healthy captures too, 73 times out of 73.
`windowsActivate` reports only whether the API call threw, not whether the right document
ended up in front. Neither indicator distinguishes a good capture from a blank one.

**Why was that not noticed?** Because we validate *captures* and never validate
*diagnostics*. `capture-check` asserts that probe values look right; nothing asserts that
an indicator can separate a known-good capture from a known-broken one. A diagnostic that
cannot discriminate is not a weak signal, it is a misleading one — and this one was
documented in the file header as the first thing to check.

**Root: diagnostics are unvalidated instrumentation.** Compounding it, a rejected capture
is discarded, so the only trace of this failure mode was a line in a host-side log that
nothing inspects. The worker had no evidence at all.

*Fix:* `documentReady` replaces `afterStart` as the primary indicator and is asserted in
`capture-check` — positively on a page that reads correctly. Rejected captures are now
written to `captures/rejected/` instead of being dropped, so the next occurrence of this
class has evidence to look at.

## What this pass says about the practice

Both A and B are the same mistake in different clothes: an assumption that held for one
capture at a time, surviving unexamined into a batch of ninety. The dataset run is the
first workload of that shape, and it found both within an hour.

C is the one that should change how we work. The 25% failure rate was invisible from the
worker's own reporting; it was only ever visible because a host-side check rejected the
captures and printed why. Instrumentation deserves the same treatment as the code it
watches: if a diagnostic is documented as the thing to check when something breaks, there
should be a test that it actually goes red when that thing breaks.
