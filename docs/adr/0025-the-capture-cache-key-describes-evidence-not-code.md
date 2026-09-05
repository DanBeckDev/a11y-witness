# ADR 0025: The capture cache key describes the EVIDENCE, never the code that produced it

## Status

Accepted. Already assumed by ADR 0007 (`CAPTURE_PROTOCOL_VERSION` as a capture-cache key) and ADR 0016
(`browserVersion`/`provisionRevision` as capture-cache keys) — this is the decision those two cite as
existing and neither one states.

## Context

A full recapture is hours of fleet time (measured at ~3h46m for 2,122 captures across three workers; a
ten-machine bare-metal fleet is faster but still not free). `npm run training:capture` therefore reuses a
capture on disk whenever nothing that shapes it has changed — which only works if "nothing that shapes it
has changed" is a decidable, machine-checked question rather than a judgement call made per change.

Two failure directions are both real and were both hit before this was settled: a key too NARROW blends
evidence gathered under different conditions into one corpus indistinguishably (an ARM64 guest and an x64
guest, or two Edge builds, reading as "the same page" when NVDA said different things); a key too WIDE
invalidates the whole corpus for a change nobody needed to pay for (CLAUDE.md's `workerCode` discussion:
"it changes when a comment changes, and invalidating 1,061 pairs over a reworded comment is how a cache
gets switched off").

## Decision

**The key is composed of everything that can change what NVDA announces, and nothing else.** Concretely
(see CLAUDE.md, "Captures are cached — and the cache is keyed on more than the page", for the full
narrative and the incidents behind each field): the page directory, the capture options, NVDA and Edge
versions, the Windows build and architecture, the provisioning revision, and `CAPTURE_PROTOCOL_VERSION`.

Three sub-decisions fall out of the same principle and are worth naming separately, because each was
argued rather than assumed:

- **A pinned dependency whose version changes what is announced is a cache-key input, not a version
  number to bump quietly.** `guidepupVersion` and `browserVersion` are both examples: guidepup 0.29→0.31
  fixed an intermittent U+FFFC artefact, and Edge 151→152 changed whether NVDA says "form" or "section"
  for an unnamed `<form>` — a spec-alignment change in the browser, not a bug in this project, and every
  corpus form moved at once. **The browser identity is therefore evidence, never configuration**: it is
  hashed into `environmentKey()` the same way NVDA's own version is, `browsers.mjs`'s Edge preset must
  stay byte-identical (a rename would silently invalidate 2,122 captures), and nothing here falls back to
  a different browser than the one configured — a silent substitution would put two browsers' evidence in
  one corpus through the one door the cache key exists to close.
- **`CAPTURE_PROTOCOL_VERSION` is a manually-bumped semantic marker, deliberately distinct from any
  automatically-computed code hash.** It moves only when a change alters what the evidence *means* (a new
  field a signal reads, a probe that announces differently) — not on every commit that touches
  `capture-core.mjs`. This is why the worker's code hash is excluded from the cache key (ADR 0030 covers
  the parity question that split off from this one: code hash is a deploy PRECONDITION, never a cache
  key).
- **A settings digest is the key input, not the boolean "did we touch a setting".** NVDA's own
  configuration (speech rate, verbosity, `speech.reportLanguage`) is user-configurable and evidence-
  affecting for the same reason a screen-reader user's own settings are rarely the shipped defaults; the
  digest (`environment.screenReaderSettings`) is what is hashed, so two guests with different settings can
  never share a cache entry even when nobody remembers a setting was ever changed by hand.

`npm run evidence:check` is the direct measurement this key is a proxy for: it compares evidence field by
field on a stratified sample and reports whether a capture-path change is cache-neutral, which is what
makes optimising the capture path (not evidence) affordable to evaluate at all.

## Consequences

- Any change to the key set invalidates every capture stamped before it. Paid once, deliberately, ideally
  bundled with a recapture already scheduled for another reason — never on impulse.
- A change to what a pinned dependency's version affects (a new guidepup release, a new Edge build) is an
  EVIDENCE change requiring `evidence:check` and, if it reports CHANGED, a `CAPTURE_PROTOCOL_VERSION` bump
  and recapture — the same review a code change to the capture path gets, applied to a dependency bump.
- The key can grow. `os`/`architecture` and `provisionRevision` were both added after the fleet grew a
  second image; the next such field will cost one recapture the same way.

## Alternatives considered

- **Hash the worker's own source code into the key.** Rejected: a comment edit or a refactor with no
  evidence effect would force a full recapture, which is precisely how a cache gets switched off in
  practice — CLAUDE.md's `workerCode` discussion is the direct record of choosing against this.
- **Treat the browser as ordinary configuration, unkeyed.** Rejected, and refuted by measurement: Edge
  152's spec-aligned `form`→`section` change proved two Chromium builds produce different NVDA
  announcements on an *unchanged* page, which is exactly the scenario a cache key exists to prevent from
  blending silently.
- **Key on the OS image alone, not on architecture and provisioning revision separately.** Rejected:
  `provisionRevision` catches an older guest that has not been re-provisioned (reporting `"unstamped"`)
  independently of whether its OS/architecture match a newer guest, which a single combined "image
  version" field could not distinguish.
