# ADR 0035: The browser preset is evidence, not configuration — and never falls back

## Status

Accepted. Implemented in `packages/nvda-worker/src/browsers.mjs` and enforced by `browser-args.test.ts`;
recorded in CLAUDE.md's "Which browser a capture drives" section as an operational fact plus an incident
("the value was the literal string `'Microsoft Edge'`, a constant standing in for a variable"), never as a
decision stating what that replaced and what was rejected.

## Context

Which browser drove a capture used to be spread across **eight** call sites, and CLAUDE.md names this
directly as this repo's most expensive recurring shape: "a change applied at seven of them and missed at
the eighth is a capture that launches Chrome and kills Edge." The capture cache already keys on `os` and
`architecture` for a stated reason — "a fleet can have more than one image" — and `environmentKey()` had
always included `browser`/`browserVersion` in that key too, but the value fed into it was the literal
string `"Microsoft Edge"` everywhere, not read from anything that could vary. The key existed; the variable
behind it did not.

## Decision

**One plain-object preset per browser** (`browsers.mjs`: exe search paths, launch flags, profile directory,
process image, window title), and **the browser is treated as evidence produced by the capture, not
configuration chosen ahead of it** — `environmentKey()` reads the preset's own `name` and version rather
than a constant, so the cache key finally does the job it was written for. Two structural rules follow from
treating it as evidence:

- **Nothing falls back.** A guest whose configured browser is missing reports `browserAvailable: false` and
  names the browser and paths it looked for; it does not quietly capture in whatever else is installed. A
  silent fallback would put two browsers' evidence in one corpus indistinguishably — exactly the failure
  the cache key exists to prevent, arriving through a different door.
- **Profiles are never shared between browsers.** Chromium itself refuses two builds on one
  `--user-data-dir`, but the more dangerous failure is quieter: a profile Edge has warmed with autofill
  data would carry that learned state into a Chrome capture if the directory were shared, contaminating one
  browser's evidence with another's history.

## Alternatives rejected

**A tidier preset name (`"edge"` instead of `"Microsoft Edge"`).** Rejected explicitly: "Edge's preset must
stay byte-identical. Its `name` is `'Microsoft Edge'` and its flag list is the same flags in the same
order, because that is what makes all 2,122 cached captures still valid. A tidier `'edge'` would invalidate
the corpus for a rename." `browser-args.test.ts` asserts the whole command line against a literal for this
reason — an individual per-flag assertion cannot see a flag that was *added*, only one that was changed or
removed.

**Falling back to any available browser when the configured one is missing.** Rejected on the same
reasoning as the cache-key fix itself: a `tiny11` image that ships without Edge reports `browserAvailable:
false` rather than silently capturing in Chrome (or whatever else happens to be installed), because a
silent substitution is a second, harder-to-find way for two browsers' evidence to blend into one corpus.
`A11Y_BROWSER=chrome` is the explicit, visible way to say a guest uses a different browser.

**Treating a new browser preset as validated by construction.** Rejected: the Chrome preset "has never
taken a capture" and is documented as a hypothesis rather than a fact — it reuses the Chromium flags Edge's
preset already proves out, plus one Chrome-specific flag for a known modal-dialog risk
(`--disable-search-engine-choice-screen`, needed since Chrome 127 made it a MODAL that blocks input while
`/health` stays green) — but whether NVDA announces identically in the two Chromium browsers is exactly
what `evidence:check --browser=chrome` exists to answer, and nobody has run it yet. A preset is not treated
as equivalent evidence to Edge's until that comparison exists.

## What deliberately has no preset, and why that is not an oversight

`window-focus.mjs` matches the window **class**, and Chromium names its top-level window
`Chrome_WidgetWin_1` regardless of branding, so the code that focuses Edge already focuses Chrome unchanged.
`pointer.mjs`'s cursor park is browser-agnostic. Neither needed a browser-specific entry, and the map does
not carry one for them — a preset exists exactly where behaviour actually varies by browser, not by
default for every browser-adjacent concern.

Firefox is not a browser preset waiting to be written: it has no CDP, so the structural census,
`bringPageToFront` and window reuse have no equivalent, and it needs a separate capture backend rather than
another map entry (ADR 0001).

## Consequences

- Adding a browser preset is an evidence claim, not a configuration convenience, and must be validated by
  `evidence:check` against that browser before its captures are trusted alongside Edge's.
- The eight-call-site duplication this replaced is now one file; CLAUDE.md's broader "A FACT STATED TWICE"
  pattern names this as one of the instances the general remedy (delete a copy; derive one from the other)
  was applied to.

## What would falsify this

If `evidence:check --browser=chrome` finds NVDA announcing the Chrome-driven pages differently from the
Edge-driven ones under the shared Chromium flag set, the preset as written is wrong evidence, not merely
unvalidated — it would need its own flags reasoned about and re-measured rather than inheriting Edge's.
