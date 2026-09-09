---
"@a11ign/evidence": minor
"a11ign": minor
---

Fixes a real defect that produced a nonsensical, published "44 headings swept against a ground truth of 1"
report — a capture of calendly.com whose form probe activated its own "Continue with Google" button,
navigating to `accounts.google.com`'s sign-in screen before the browser's element census was taken. NVDA's
sweep had genuinely read calendly's real 44 headings; the census, taken after the whole sweep at the time,
described Google's page instead — and the report treated the census's tiny count as calendly's real total,
printing "reached in full".

Two changes:

- `packages/nvda-worker/src/capture-probes.mjs`: the census is now taken before ANY probe capable of
  navigating the page (previously only before `probeRouteChange`, which missed the opportunistic form
  probe's own activation — the actual cause here). The census reads the accessibility tree over an
  already-open DevTools socket, never NVDA, so this changes WHEN a diagnostic snapshot is taken, not what
  a capture hears; `CAPTURE_PROTOCOL_VERSION` is untouched.
- `@a11ign/evidence/conformance`: a census whose CDP target could not be confirmed (`targetMatch:
  "fallback"`) is now refused for any sweep-versus-census comparison, and the report states plainly that
  the census likely describes a different document rather than treating its count as ground truth. New
  export `censusTargetMismatchReason`; `censusFromDiagnostics` also refuses a fallback-target census.
