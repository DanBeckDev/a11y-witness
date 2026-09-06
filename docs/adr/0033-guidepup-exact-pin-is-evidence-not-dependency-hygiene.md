# ADR 0033: guidepup is pinned to an exact version because its version is evidence, not a dependency choice

## Status

Accepted. The pin itself is stated in `packages/nvda-worker/package.json` and mentioned in ADR 0004
("pinned exactly `0.31.0`, not `^0.31.0` — CLAUDE.md establishes that guidepup parses NVDA's speech before
we see it") — but ADR 0004 defers the reasoning to CLAUDE.md rather than recording it, and CLAUDE.md's
own "guidepup is pinned at 0.31.0, and the version is EVIDENCE" section is an incident record, not a
decision record: it never states the alternative (a caret range) or says what would justify moving off
this pin.

## Context

guidepup is the library that drives NVDA and returns what it spoke; every capture's transcript passes
through it before this project ever sees the text. A library upgrade that changes how it reads, buffers or
recovers NVDA's speech therefore changes the evidence, in the same way a browser or NVDA version does.

This was not a hypothetical risk. Upgrading 0.29.2 → 0.31.0 fixed an intermittent OBJECT REPLACEMENT
CHARACTER (U+FFFC) that had been appearing on 3–31% of affected captures for weeks (measured 1 in 15
before the upgrade, 0 in 15 after) — a real evidence defect that a version bump silently fixed, which is
exactly the shape that argues both for pinning (so nobody's `npm update` reintroduces it unnoticed) and for
treating the *version itself* as a fact worth recording, not just the fix. The same upgrade changed
observable behaviour in the other direction too: 0.31 throws when `start()` is called on an already-live
NVDA, where 0.29 tolerated it silently — masking real connection-state drift that the newer, stricter
behaviour now surfaces (adopted rather than treated as a new failure, per `startScreenReader`'s catch).

## Decision

**guidepup is pinned to an exact version (`0.31.0`, not `^0.31.0`), and the version travels as a capture
cache-key field (`guidepupVersion`) and a `fleet-consistency` `MUST_MATCH` entry** — the same treatment
`browserVersion` gets, and for the identical reason: two guests on different versions must never share a
cache entry, because they are not producing comparable evidence.

## Alternatives rejected

**A caret range (`^0.31.0`).** This is the one alternative actually recorded, in ADR 0004's own words: "a
caret range would let a consumer's `npm update` silently change what a capture says." An ordinary
dependency is pinned loosely so a patch release's bug fixes arrive automatically; guidepup is the opposite
case, because *its own patch releases have changed what NVDA is recorded as having said*, and a silent
change to recorded evidence is worse here than a stale dependency.

**Treating the version as an ordinary fact, not a cache-key input.** Not explicitly argued against anywhere
found, but ruled out by construction: `guidepupVersion` sits in `capture-cache.mjs` alongside
`browserVersion`, `provisionRevision` and `screenReaderSettings` — every other field in that key exists
because CLAUDE.md's own repeated lesson is that a version change silently blending into old evidence is
this project's most expensive recurring defect (the Edge `browserVersion` memo that "lied for five days" is
the sharpest instance). Including guidepup follows the same rule already applied elsewhere rather than
being independently argued for.

## Consequences

- Upgrading guidepup is an evidence change, not a routine dependency bump: `npm run evidence:check` must
  run and a recapture should be expected, the same discipline as an Edge or NVDA version change.
- The fleet must upgrade together. `fleet-consistency`'s `MUST_MATCH` on `guidepupVersion` means a
  partially-upgraded fleet reads INCONSISTENT and refuses to start a capture run, rather than silently
  mixing two guidepup versions' evidence into one corpus — CLAUDE.md records this happening briefly during
  the 0.29→0.31 upgrade itself, caught only because the check existed.
- 0.30+'s session config (`sessionUserConfig/nvda.ini`, written beside the base config) is a guidepup
  internal that anything assuming a single `nvda.ini` file must now account for.

## What would falsify this

If guidepup's own release process starts guaranteeing that patch/minor releases never change speech
timing, buffering, or recovery behaviour — verifiable the same way the 0.29→0.31 change was, by running
`evidence:check` across the version boundary — the case for an exact pin over a narrower semver range
(e.g. pinning only the minor) weakens and is worth revisiting. Nothing in guidepup's public API makes that
guarantee today.
