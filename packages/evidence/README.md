# `@a11y-witness/evidence`

The **shared evidence contract** for screen-reader accessibility captures: the wire types a capture backend
implements, the pure predicates that decide whether a capture is trustworthy, and the WCAG 2.2 AA criteria
list.

Zero dependencies. No `node:fs`, no `process.env`, no I/O of any kind — so it imports cleanly in a Windows
guest, a browser, a Lambda, or someone else's CI glue. Apache-2.0, deliberately more permissive than the rest
of [a11y-witness](https://github.com/DanBeckDev/a11y-witness) (AGPL-3.0-or-later), because a contract you must
agree with to interoperate is not the place for a copyleft obligation.

```bash
npm install @a11y-witness/evidence
```

## Did the capture actually reach the page?

The predicate that matters most, and the reason this package exists. A capture can succeed at every mechanical
level — the browser opened, the screen reader spoke, the title matched — and still be evidence about a consent
dialog in front of the page rather than the page.

The oracle is the browser's own accessibility tree, carried on the capture as a `structureCensus` diagnostic
mark. Compare what the page *exposes* against what the screen reader could *reach*:

```js
import { captureReachedThePage, captureDoubt } from "@a11y-witness/evidence/verify";

// Real numbers from theregister.com: the page exposes 463 headings; quick navigation reached one, because
// the consent modal traps focus and will not let go.
const contained = {
  // NVDA speaks the document title on load, so the title check PASSES - which is exactly why a title
  // check cannot see this failure.
  transcript: ["The Register, document", "We value your privacy", "button, Accept all"],
  structure: { headings: ["We value your privacy"], landmarks: [], formFields: [] },
  diagnostics: [{ event: "structureCensus", heading: 463, link: 793 }],
};

captureReachedThePage(contained);              // false
captureDoubt(contained, "The Register");       // "contained"
```

```js
const healthy = {
  transcript: ["Accessible Technology, heading, level 1", "link, About us"],
  structure: { headings: ["Accessible Technology", "Our work", "Contact"], landmarks: [], formFields: [] },
  diagnostics: [{ event: "structureCensus", heading: 12, link: 79 }],
};

captureReachedThePage(healthy);                // true
captureDoubt(healthy, "Accessible Technology"); // null — no reason to distrust it
```

Without that census a capture gets the benefit of the doubt: **no oracle, no verdict**. Headings are the only
comparator used, and the reason is measured — quick navigation cannot reach a landmark that *contains* the
caret, so a `<main>` wrapping the page is missing from 2,063 of 2,064 corpus captures, and a gate built on
landmarks or links would have fired on healthy captures until someone switched it off.

## Absence can be the finding — so nothing here rejects an empty capture

The rule these predicates are built around, learned expensively:

> **A check must never reject evidence whose absence is the finding.**

A `div`-based fake button announces no form controls at all, and that silence *is* the WCAG 4.1.2 failure. A
guard that rejected "the probe found nothing" once threw away exactly that evidence and failed 44 real cases.
So `captureHasSubstance` and friends answer *"is this capture trustworthy?"*, never *"is this page
accessible?"* — the second question needs the case definition, which lives a layer up.

## The other two entry points

```js
import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

// [{ num: "1.1.1", name: "Non-text Content", level: "A", since: "2.0" }, ...]  — 55 criteria, A and AA
```

```ts
import type { CaptureBackend, CaptureRequest, CaptureResult } from "@a11y-witness/evidence";
```

`CaptureBackend` is what an **alternative screen reader** implements. The reference backend drives NVDA on
Windows; VoiceOver and Orca are unimplemented, not ruled out, and this interface is the whole of what they
would need to agree with. Nothing else in the repo imports these types — they are structurally checked at the
boundary — which is why they belong in the package a third party installs rather than in the capture
pipeline.

## Stability

The highest in the repo, by design. A breaking change here majors every downstream package, which is the
intended disincentive. Types are checked structurally, so adding an optional field is a minor; renaming or
narrowing one is a major.
