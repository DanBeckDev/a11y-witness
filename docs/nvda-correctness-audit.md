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
