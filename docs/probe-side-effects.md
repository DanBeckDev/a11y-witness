# What every probe in `capture-probes.mjs` DOES, not just what it reads

Every probe here is scoped and documented by what it *reads* — `docs/screenreader-coverage.md` is exactly
that map. Nothing states what each one *does* to the page, to NVDA's mode/caret, or to DOM focus that a
LATER probe can then observe. That absence is where two real defects lived: §43 (`probeFocusReveal`
reading a starting position an earlier probe silently established) and the §42/`focus-reset-not-logged`
interaction (a diagnostic action becoming evidence to a listener that started watching earlier than the
action assumed). Both were found by capturing, not by reading this file — because there was nothing here
to read.

This is that map, built by reading the whole file once, in order. **It is an audit, not a refactor**: it
changes no code and reorders nothing. Where it found something worth fixing, it says so and stops —
per the brief, a reordering is itself an evidence change (`probeOrder` is a wire field with cases
depending on it) and costs a recapture the same way any other capture-path change does.

## Three kinds of state a probe can leave behind

Every side effect below is one of these, and they are **independent** — resetting one does not reset
another, which is the exact mechanism behind every finding in this file:

| state | what resets it | what does NOT reset it |
|---|---|---|
| **NVDA's browse/focus MODE** | `Escape` (`press`, not `perform`), any of `BROWSE_MODE_REMEDIES` | — |
| **NVDA's quick-nav CARET** | `Control+End` (`anchorToTop`, `establishBrowseMode`) | mode-only remedies |
| **DOM FOCUS** (`document.activeElement`) | `resetFocusToDocumentStart`'s `blur()` (ONLY inside `probeFocusReveal`, since §43) | `anchorToTop`, `establishBrowseMode`, `restoreBrowseMode` — **none of these ever touch it** |

`anchorToTop`/`establishBrowseMode`/`restoreBrowseMode` all reset the first two and **none of them ever
reset the third**. Every probe that walks with `Tab` (which moves focus *relative to* whatever
`document.activeElement` currently is) is exposed to whatever the LAST thing to move DOM focus left
behind — quick-nav-based probes are not, because quick-nav is caret-relative, not focus-relative, and the
caret IS reset between phases. This is the one fact the whole table below is organised around.

## The table

Read top-to-bottom as the order `navigateByStructure` actually runs things. "Resets?" says whether the
probe re-establishes a KNOWN precondition before acting, or inherits whatever the previous phase left.

| # | phase / probe | reads (precondition) | does (side effect) | resets before acting? | who can observe the side effect |
|---|---|---|---|---|---|
| 0 | `runProbeSequence` boundary (`establishBrowseMode`, between the sweep/focus pair only) | — | presses the full `BROWSE_MODE_REMEDIES` ladder + `Control+End`, unconditionally | n/a — this IS the reset | resets MODE + CARET for whichever phase runs next in the pair. **Never resets DOM focus.** |
| 1 | `sweepEveryStructuralType` (headings/landmarks/formFields/graphics/links/lists/frames, `probeTableCells` opt-in) | caret position (quick-nav is caret-relative) | quick-nav only, EXCEPT: `formFields`' `onItem` callback is `operateControl`, which may ACTIVATE a disclosure/submit/task/toggle control | no explicit reset at sweep start (relies on read-through's own trailing caret position, `CLAUDE.md`'s documented accident) | any LATER Tab-based probe, if the activation moved DOM focus (see row 1a) |
| 1a | `operateControl`'s activation (disclosure/form/task/toggle), inside the sweep | — | **moves DOM FOCUS** whenever the activated control is an accessible form rejecting input (focus to the invalid field) or a disclosure moving focus into what it opened — stated explicitly in `operateControl`'s own comment. Runs UNCONDITIONALLY for disclosures, not gated on an opt-in flag. Ends with one `Escape` (mode only) + a speech-quiet wait — **never blurs DOM focus** | no | `probeFocusContext`, `probeFocusReveal` (before §43's fix; after it, only `probeFocusReveal` self-protects), `probeFocusOrder` — see "New findings" below |
| 2 | `rescanFormFieldsAfterSubmit` (end of `runSweep`) | — | `anchorToTop()` (caret+mode) then a quick-nav re-sweep of form fields | yes, but caret/mode only | none — quick-nav, unaffected by DOM focus |
| 3 | `probeFocusContext` (3.2.1, opt-in) | **inherits DOM focus** from whatever ran before it (the sweep's activation, if `runFocus` runs after `runSweep`; or nothing, under `focus-first`) | `anchorToTop()` (caret+mode only), then Tab-walks up to 8 stops, landing DOM focus on the last control reached | **NO** — calls `anchorToTop()` but never blurs DOM focus first | `probeFocusReveal` (next), and `probeFocusOrder` if `probeFocusReveal` is off — **UNADDRESSED §43-shaped risk, see below** |
| 4 | `probeFocusReveal` (1.4.13, opt-in) | **inherits DOM focus** from `probeFocusContext` (if it ran) or the sweep | `anchorToTop()` (caret+mode), reads `startedFrom`, calls `resetFocusToDocumentStart()` to blur, THEN Tab-walks up to 8 stops, ending with 2×`Escape` (mode only) | **YES, at the start** (§43's fix) — but **not at the end**: after the walk, DOM focus sits wherever the last successful Tab landed, unreset | `probeFocusOrder` (next) — see below |
| 5 | `probeFocusOrderWithEventLog` / `probeFocusOrder` (2.1.1/2.1.2/2.4.1/2.4.3, the most widely-read channel in this file) | **inherits DOM focus** from `probeFocusReveal`'s walk (or `probeFocusContext`'s, or the sweep's) | `anchorToTop()` (caret+mode only), then Tabs up to 150 stops or until the ring cycles | **NO** — the SAME gap `probeFocusReveal` had before §43, on the probe whose evidence 28 other files read | `probeDialogEscape` (deliberately, by design — see below); potentially every consumer of `focusOrder` if the walk's first stop is not the document's true first tab stop |
| 6 | `probeDialogEscape` (2.1.2, opt-in) | **deliberately relies on** NVDA being left in focus mode by `probeFocusOrder`'s walk — its own comment states this: *"the first press pays NVDA's toll and the second reaches the application"* | 2×`Escape` (mode only); **no `restoreBrowseMode` call at all** — the only focus-riding probe with no cleanup | none needed for its own read, but leaves mode UNRESTORED for whatever runs next | `probeArrowNavigation`, if it ran next, is protected only because `landOnControl` calls its OWN `anchorToTop()` first — an accidental rather than deliberate save |
| 7 | `probeArrowNavigation` (2.1.1, opt-in) | — | `landOnControl` (`anchorToTop` + quick-nav to a radio + focus-mode toggle), then Down/Right arrows | yes (via `landOnControl`) | `probeTypedFeedback` (next) |
| 8 | `probeTypedFeedback` (3.3.1/3.2.2, opt-in) | — | `landOnControl` + **types 6 digits into a real page field** — the only probe here that changes the PAGE'S OWN CONTENT, and its own comment states it must run last for exactly that reason | yes (via `landOnControl`) | nothing within `runFocus` (it is last); leaves a typed value in a field for anything after `runProbeSequence` to read |
| 9 | `runConfiguredForm` / `probeConfiguredForm` / `fillFormState` | — | fills every declared field (typing/toggling/choosing), submits the named control | `anchorToTop()` at `fillFormState`'s start, and again after EVERY field (`applyFill` ends in `restoreBrowseMode`) | quick-nav-based throughout, so DOM-focus-safe; but its OWN submit may move DOM focus (accessible-form rejection) and nothing blurs it afterward |
| 10 | `censusBeforeNavigating` (structural/DOM/media census) | — | none — pure reads over CDP | n/a | — |
| 11 | `probeRouteChange` (2.4.2, opt-in) | — | `anchorToTop()`, quick-nav to first link, **activates it — the one probe that can leave the page under measurement entirely** | yes (quick-nav-based, DOM-focus-safe) | `crossCheckAgainstElementsList` (next) — see "New findings" |
| 12 | `crossCheckAgainstElementsList` / `probeElementsListCounts` (opt-in) | `structure` counts captured **at sweep time, before anything moved the page** | opens NVDA's Elements List — a MODAL dialog that blocks input — reads counts, closes it unconditionally (2×`Escape`) | n/a (its own read is self-contained) | **compares evidence from two different documents if `probeRouteChange` navigated — see below** |

## New findings — §43's shape, unaddressed elsewhere

**1. `probeFocusContext` and `probeFocusOrder` have the identical defect §43 fixed in `probeFocusReveal`,
and neither has the fix.** Both walk `Tab`, which moves focus relative to `document.activeElement`; both
call only `anchorToTop()` beforehand, which resets the CARET and MODE and never DOM focus. Both therefore
start their walk from wherever the LAST thing to move DOM focus left it — the sweep's own disclosure/form
activation (row 1a, which runs UNCONDITIONALLY for disclosures, not gated on an opt-in flag) if nothing
else ran first, or `probeFocusContext`'s/`probeFocusReveal`'s own walk if they ran before it.

`probeFocusOrder` is the more consequential of the two: it is the channel `docs/screenreader-coverage.md`
lists against **2.1.2, 2.1.1, 2.4.1 and 2.4.3**, and its own comment says its evidence is read by many
downstream consumers. If its Tab walk starts mid-ring rather than at the document's true first tab stop,
`stops[0]` is not the page's first focusable element — the tab order is a cycle (the code already accounts
for detecting when it wraps), so the SET of elements found is very likely still complete, but the
**order is rotated**, and any consumer comparing tab order against READING order (2.4.3's whole subject) is
comparing a rotated list against one that starts at the true top. That is the identical shape as
`§43`'s own finding and as the historical "tab order is a cycle" defect this file's sibling docs already
record for a different cause.

Not yet measured on a real page — I have not captured, per the resource ban, and the peer's own capture is
the only way to know whether this is `§43`'s exact size (15 corpus positives resting on one starting
position) or smaller. Recorded here because the MECHANISM is provably present by reading the code, which is
what an audit can establish without a capture.

**2. `crossCheckAgainstElementsList` runs after `probeRouteChange`, and nothing moved it — this is `§40`'s
own defect, in the one place `§40`'s fix did not reach.** `censusBeforeNavigating`'s three CDP-based
censuses were moved to run BEFORE `probeRouteChange` specifically because `probeRouteChange` "is the only
probe below that can leave the page under measurement" and reading them after it silently described
wherever the activated link led rather than the page under test (`known-gaps.md` §40, byte-identical
post-navigation censuses on two GOV.UK pages differing by 11 headings and 136 links). `structure`'s counts
are captured much earlier (during the sweep), but `crossCheckAgainstElementsList` reads NVDA's live
Elements List **after** `probeRouteChange`, comparing against `structure` regardless. If `probeRouteChange`
navigated, this cross-check is now comparing the sweep's original-page counts against the NEW page's
Elements List — the exact "two things compared that describe different moments" shape §40 already named,
left in the one place that predates §40's own fix (this cross-check call site did not move when the
censuses did).

Severity depends on how often `probeNavigation` and `probeElementsList` are requested together — I did not
find a fixture or call site forcing both on at once, so this may be rare in practice today. Recorded
regardless, because the mechanism is the same one §40 already paid to discover once.

## Already load-bearing by accident, and DOCUMENTED as such (nothing new here — named so the table is complete)

These are not new findings; they are in the code's own comments, and are listed so the table is a complete
answer to "what does ordering do here", not a partial one that only names what I found.

- **The default probe order (`sweep` before `focus`) "does not work by design, it works by accident"** —
  `establishBrowseMode`'s own comment, quoting the CLAUDE.md lesson: the read-through leaves the caret past
  the last heading, which is what makes the backward sweep able to reach the `h1`. `Control+Home` was tried
  and made it worse.
- **`probeDialogEscape` "rides with" `probeFocusOrder` by design** — it needs NVDA left in focus mode by the
  Tab walk immediately before it, and its own comment states this outright. Reordering it away from
  `probeFocusOrder` would silence it (a real dialog handler would never see its Escape).
- **`probeTypedFeedback` must run last of the four focus-riding probes** — it is the only one that changes
  the page's own content, and its comment says a later probe reading the field it typed into would be
  "measuring our own input".
- **`probeTableCells`' `anchorFirst` sweeps (`lists`, `frames`)** — a list or frame CONTAINS the elements
  swept before it, so quick-nav cannot find the container the caret is standing inside without an anchor.
  Costs ~3s, paid deliberately once rather than before all six sweeps.

## What I checked and did NOT find a problem

- **`probeRouteChange` itself is DOM-focus-safe.** It quick-navs to the first link rather than Tabbing, so
  inherited DOM focus (from anything upstream) does not affect it — only the caret, which `anchorToTop()`
  resets at its own start.
- **`runConfiguredForm`'s fill walk is DOM-focus-safe for the same reason** — `advanceToNextField` is
  quick-nav, not Tab.
- **`probeArrowNavigation` and `probeTypedFeedback` both self-protect via `landOnControl`'s own
  `anchorToTop()`**, so `probeDialogEscape`'s missing restore (finding above) happens not to leak past them
  — but that is `landOnControl`'s own precondition step doing the work, not anything `probeDialogEscape`
  provides, which is why it is listed as an accident rather than a guarantee.
- **The sweep's own six quick-nav types are unaffected by DOM focus**, only by the CARET, which nothing
  resets before the sweep starts by design (see "already load-bearing by accident" above).

## Whether anything should change

Per the brief: this is the audit, not the fix, and a reordering is itself an evidence change. Two things
follow from what is above, and neither is a reorder:

1. **If finding 1 is real on a real page, the fix is the SAME PATTERN §43 already used** — call
   `resetFocusToDocumentStart()` (or a shared helper wrapping it) at the start of `probeFocusContext` and
   `probeFocusOrder`, exactly as `probeFocusReveal` now does. That is a code change to two more probes, not
   a reorder, and it is a `packages/nvda-worker/src/` change like every fix in this bundle — it queues
   behind the same recapture window.
2. **Finding 2's fix, if pursued, is moving `crossCheckAgainstElementsList`'s call site to before
   `probeRouteChange`**, mirroring exactly what `known-gaps.md` §40 already did for the census. That IS an
   ordering change to this specific pair, but it is not a change to `probeOrder` (the wire field governing
   sweep/focus) — `probeElementsList` and `probeNavigation` have no such gate today.

Neither is built here. Both are candidates for their own units, each with its own acceptance test — the
same discipline every other unit in this bundle has used.
