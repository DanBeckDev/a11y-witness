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
- **Deferred (should-fix):** the read-through doesn't anchor at the top first, so on an auto-focusing page it could start mid-page or be inert in focus mode. The fix (`anchorToTop()` before the read-through) was applied and then **reverted**: on the CI runner, firing Escape + Ctrl+Home before NVDA had settled on our freshly-launched page surfaced Edge's *start-page* content (the MSN feed) instead of the target page. Re-apply once the Edge launch is hardened to open only the target page (see backlog). The current gentle start (read in place, then step) reads the target page reliably in CI today.

### Quick navigation / browse mode
- **Correct:** sweeping both directions reaches every element regardless of cursor position (quick-nav has no documented wrap); the no-movement guard is the right primary stop signal.
- **Fixed (integrity):** the comment claiming NVDA's "F" reaches `<button>`s that "B" misses was stated as fact; the guide treats "F" and "B" as distinct co-equal commands and documents no such gap. Re-worded to a build-specific *observation* (defend-or-retract).
- **Deferred (robustness):** to stop quick-nav escaping a heading-less document into browser UI, anchoring before the structural sweep was tried and reverted for the same CI reason as above. In CI the Edge first-run-experience suppression already removes the welcome surface; the remaining hardening (and re-applying the anchor) is bundled into the backlog item below.
- **Backlog:** harden the Edge launch so it opens ONLY the target page (no start-page/NTP tab), then re-apply `anchorToTop()` before the read-through and structural sweep. Separately, NVDA's Elements List (`NVDA+F7`) is the guide's purpose-built bulk enumeration for links/headings/form-fields/buttons/landmarks — a cleaner long-term path than repeated quick-nav (the dialog must be read via list navigation, not `lastSpokenPhrase`); not a blocker.

### Interaction / focus mode
- **Correct:** `nvda.act()` (Enter) is the documented way to activate a button-type control (disclosure, submit); Escape "switches back to browse mode if focus mode was previously switched to automatically" — exactly our case; capturing the `spokenPhraseLog` delta (not just the last phrase) is good practice. Auto focus mode triggers only for complex-interaction controls (edit fields / combos), so our unconditional Escape before a re-scan is harmless when not needed.
- **Note (comments added):** Ctrl+Home is a standard Windows caret key browse mode passes through, not an NVDA command; Enter ≡ Space for buttons. If a future probe toggles a checkbox/radio, use Space; if it types into a field, use focus mode deliberately.

### Setup / portable copy / configuration
- **Correct:** driving desktop (Win32) Edge avoids the one browse-mode-relevant portable-copy restriction (no browse mode in Windows Store/UWP apps); focusing the window before `nvda.start()`, the startup health check, and letting Guidepup own NVDA's lifecycle (`nvda.stop()`, never `taskkill`) are all sound.
- **Fixed (determinism):** the setup recipe now pins the NVDA install dir instead of defaulting to `%TEMP%` (which the OS can clean, forcing a silent reinstall with newer defaults).
- **Deferred (determinism):** "Automatic say all on page load" is on by default — NVDA begins auto-reading the page on load, which can race our line-stepping. The intended fix (anchorToTop's Ctrl+Home cancels the auto-read) is part of the reverted read-through anchoring above; today the `NVDA_SETTLE_MS` window mitigates it on the short pages we capture. Re-apply with the hardened Edge launch.
- **Backlog:** for cross-version reproducibility, pin a known NVDA settings profile (symbol level, element-reporting toggles, "Report live regions", auto-focus-mode) rather than inheriting Guidepup's defaults. Note: the relevant live-region setting is **"Report live regions"** (Document Formatting, on by default) — *not* "Report dynamic content changes" (`NVDA+5`), which governs terminals/chat. The guide's wording that NVDA reports only *"some"* dynamic web content corroborates why live-region capture is inherently unreliable (see Phase 1b).

## Net result

The verdict — no incorrect or unsafe NVDA usage — is the headline. Applied:
the integrity re-wording (F/B comment) and the pinned-install-dir determinism
fix. The `anchorToTop()` helper (Escape → browse mode, Ctrl+Home → top) is
validated and in use in the post-submit field re-read.

Honest caveat: the audit's recommended *read-through and structural* anchoring
was applied, broke CI (the early keystrokes surfaced Edge's start page on a
fresh runner profile instead of the target page), and was reverted. It is now a
backlog item gated on hardening the Edge launch to open only the target page —
a good example of why reproducible CI matters: the VM's established Edge profile
hid the interaction the fix would have caused. Backlog (Elements List
enumeration; hardened Edge launch + re-applied anchoring; pinned settings
profile) is tracked in `PLAN.md`.
