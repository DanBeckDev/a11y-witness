## What changes, and why

<!-- The why matters more than the what here; the diff shows the what. -->

## How you verified it

<!-- Tick what you ran. Not every box applies — see CONTRIBUTING.md for which apply to your change. -->

- [ ] `npm test` (~850 tests, no worker)
- [ ] `npm run lint` and `npm run typecheck`
- [ ] `npm run training:check-signals` — if you touched a probe's output shape or a case definition
- [ ] `npm run capture:check -- --worker=<url>` — **required** if you touched `capture-core.mjs`
- [ ] `npm run evidence:check <worker>` — if you touched the capture pipeline; says whether the evidence
      moved rather than whether the timing did
- [ ] Not verifiable locally, and here is why:

## If you changed a guard or a gate

- [ ] I introduced the fault and watched the check fail, then fixed it

<!-- Two guards in this repo passed against a corpus containing the exact defect they were written for.
     A guard that has never been red is a guard nobody has tested. -->

## If you changed the capture pipeline

- [ ] `CAPTURE_PROTOCOL_VERSION` is unchanged, **or** the change alters what the evidence *means* and a full
      recapture is intended
- [ ] The remedy is reachable from **every** path that needs it, not just the one I was looking at

<!-- The most expensive recurring defect here is a correct, commented fix applied at one call site when the
     behaviour reaches several. -->

## Anything a reviewer should be sceptical of

<!-- A number without a measurement behind it, an assumption you could not check, a path you could not test. -->
