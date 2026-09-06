# Capture-probe incidents — the diagnoses, moved out of the code

**This is a RECORD, not intent.** Each entry is a closed incident whose step-by-step diagnosis lived
inline in `packages/nvda-worker/src/capture-probes.mjs`. The call sites keep the sentence that constrains
the next edit; what moved here is the narrative of how the fault was found.

The test applied, from the row that asked for this (#110, via `docs/backlog.md`'s FILE SIZE row):

> *"Some of the comment bulk belongs in `docs/`. A capture-path incident is worth recording; recording it
> inline at forty lines is how a 1,748-line file wears 3,020 lines of prose. **The test is whether the next
> person reading THAT FUNCTION needs it: NVDA quirks and ordering constraints yes, post-mortems no.**"*

The precedent is `docs/capture-protocol-version-history.md`, moved out of `capture-core.mjs` for the
identical reason. **Nothing here was deleted** — the measurements are the asset, and losing one to tidy a
file would be the worse trade by a wide margin.

**What deliberately did NOT move**: every sentence stating why the code is shaped the way it is. `press`
rather than `perform(exitFocusMode)`; `refreshBrowseBuffer` before `anchorToTop`; the first Escape being a
toll NVDA consumes; NVDA spelling a field name character by character in focus mode. Those are live
constraints on any future edit and they belong at the call site.

---

## `restoreBrowseMode` — three measurements on 2026-09-01

The function exists because `landOnControl` enters focus mode, and under `probeOrder: "focus-first"` the
structural sweep runs afterwards — where a quick-navigation letter is not a command but INPUT, typed into
the page being measured. That is the 353-capture contamination, reintroduced by a probe that borrowed
focus and did not give it back.

**It never reached the corpus, and the cross-check is why.** `training:capture` rejected all three
attempts on both cases with:

> *"the read-through announced a heading but the heading sweep found none — the page was not traversed"*

The guard that refuses a capture contradicting itself is what stopped it.

**The remedy ladder made it worse, and the reason generalises.** `BROWSE_MODE_REMEDIES` is an ESCALATION
the sweep applies one at a time, testing between — its own comment says *"neither is trusted; both are
tested by whether the next step still echoes"*. Applied blindly as a sequence it is worse than the first
remedy alone, because `moveToContainingBrowseModeDocument` is a **toggle**: run when Escape has already
left focus mode, it goes back in.

> Measured 2026-09-01: the arrow probe worked perfectly — arrows moved 1 → 2 → 3 through the radio group —
> and the capture was still rejected, because the sweep that followed swept 0 headings on a page with an
> `h1`. `arrowNavBrowseRestored` was marked, so the restore HAD run; **it was the restore itself that put
> the mode back.**

**And restoring the mode is not restoring the buffer.**

> Measured 2026-09-01 with the anchor alone: the sweep ran and NVDA was SILENT in both directions —
> `observed.headings.stop = {prev: "silent", next: "silent"}`, 0 headings and 0 form fields on a page that
> has both. That is not a mode that failed to restore, it is a buffer with nothing in it.

---

## `probeFocusReveal` — the 1.4.13 cases, 2026-09-05

Three findings from one investigation, all closed by the code at the call site.

**1. The baseline was taken on a document the focus probe had already walked.** `before` used to be read
with focus already on a control, reasoned at the time as *"the baseline for what this page shows WHILE
something is focused"*, to avoid counting what the focus probe itself revealed. **Counting exactly that IS
the finding**, and the inversion cost all 18 of the 1.4.13 cases.

> Measured 2026-09-05, from the tab ring of `focus-panel-undismissable-fee.bad`: stop 2 is the trigger and
> stop 3 is the link inside the `hidden` panel, so the panel was already open before this probe took its
> first census, and **the delta was zero by construction.**

**2. `focusHeld` was false on every capture, and it was two alphabets compared as strings.** Taken before
any Escape, `focusBefore` is a FOCUS-MODE reading and `focusAfter` a BROWSE-MODE one, so they can never be
equal.

```
focusBefore  "B, o, o, k, i, n, g, space, r, e, f, e, r, e, n, c, e"
focusAfter   "Booking reference, edit, focused, blank"
```

Focus had not moved at all. **The U+FFFC and U+E604 lesson a third time** — two alphabets compared as
strings. The remedy is at the call site: read BETWEEN the two Escapes, so both are browse-mode readings.

**3. A boolean is where an investigation stops.**

> Measured 2026-09-05: `focusHeld` read `false` on BOTH variants of every 1.4.13 case, which makes the
> signal — `focusHeld === true && dismissed === false` — unable to fire on the bad page, and makes
> `vanished` fire on the conformant one.

Whether that was focus genuinely moving, or the same control announced differently once Escape had left
focus mode, **is not decidable from `false`**. The strings are the evidence; recording them costs nothing
and one capture then answers it. That is why `focusBefore`/`focusAfter` are on the mark rather than in the
verdict.
