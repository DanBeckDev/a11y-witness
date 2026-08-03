# The U+FFFC artefact — RESOLVED, and the dead ends worth not re-running

An OBJECT REPLACEMENT CHARACTER (U+FFFC, `￼`) intermittently appeared appended to form-field
announcements:

```
"Postcode, edit, ￼, button, Book parcel"     instead of     "Postcode, edit, button, Book parcel"
```

It was in the corpus for weeks at 3–31% of affected captures depending on environment, with **26
good/bad pairs where one variant carried it and the other did not** — so those pairs were compared
across evidence that differed for a reason unrelated to accessibility. Roughly 1.7% of the corpus
overall (36 of 2,122; 6.8% of the 532 form/field captures).

## Cause: guidepup's speech parsing. Fixed by upgrading 0.29.2 → 0.31.0

Measured on the reproduction page:

| guidepup | result |
|---|---|
| 0.29.2 | `"Postcode, edit, ￼, button, Book parcel"` — ~7%, 1 in 15 |
| 0.31.0 | `"edit, , button, Book parcel"` — 15 of 15 identical on the reproduction page |

The placeholder now renders as a consistent empty segment instead of surfacing intermittently. The
defect was never the character; it was that the same unchanged page announced differently from one
capture to the next.

### Corrected against the full corpus: reduced, not eliminated

That table says "15 of 15 on the reproduction page", and an earlier version of this document
generalised it to "zero U+FFFC" and called the artefact fixed. **The full recapture refutes that** —
one page, 15 times, cannot measure a ~1% intermittent fault, which is the same small-sample error
this document's own §"verifying against a fixture that cannot fail" was written to warn about.

Measured over all 2,122 captures after the upgrade:

| | before (0.29.2) | after (0.31.0) |
|---|---|---|
| captures carrying `￼` | 36 | **25** |
| pairs where one half carries it | 26 | **25** |
| of those, marker on the BAD half | — | 13 — **legitimate signal** |
| of those, marker on the GOOD half | — | 12 — **residual noise** |

The split is the useful part, and it means the two halves must be read differently. `rules.ts` uses
`EMPTY_NAME = "￼"` to *detect* an unnamed control, so `"button, ￼"` on an `icon-button-unnamed` bad
page is the 4.1.2 finding, not an artefact — a strip-the-character "fix" would delete evidence. The 12
good-half occurrences are named fields with a trailing empty segment and are genuine residual noise at
~1% of the corpus. Reduced by two-thirds and no longer the dominant source of pair asymmetry, but open.

`guidepupVersion` is now in the cache key (`capture-cache.mjs`) and in the fleet-consistency check
(`fleet-consistency.mjs`), because the upgrade changed every form transcript. Two guests on different
versions must never share a cache entry — and during the upgrade the fleet was briefly split, with
nothing in place to notice.

## Seven theories, all wrong — do not re-run these

Every one was tested and killed. All were in the browser; the bug was in the library reading NVDA.

| theory | how it died |
|---|---|
| Render race on `<input type="date">` picker | the fixture is `type="text"`; no picker exists |
| Edge autofill learning from `probeForms` | reproduces on capture 1 of a fresh browser session |
| Edge policy (`AutofillAddressEnabled=0`) | applied and verified live; still ~7% |
| Launch flags (`AutofillServerCommunication`, …) | applied; still ~7% |
| Deleting `Web Data`/`Login Data` at boot | applied; still ~7% |
| Chromium's AX tree still settling | tree byte-identical from `loadEventFired` to +2000ms |
| DOM mutation from the form submit | the artefact is in the read-through, which runs BEFORE `formProbe` |

The Edge flags and the autofill-store deletion were kept anyway — a form field's announcement should
describe the page, not what the browser profile has memorised. They were simply not this bug.

## The expensive mistake: verifying against a fixture that cannot fail

Three "fixes" were declared working against pages incapable of showing the fault.

- `form-error-silent/bad` — label is "Reference number", not personal data. **15/15 clean regardless.**
- `field-followup-date/good` — does not auto-focus its input, so the affordance never appears.
- `form-unlabelled/bad` — no date field at all.

**Reproduce the fault with your test before trusting the test's verdict.** Use
`form-error-silent-postcode/bad` — label "Postcode", personal-data-like, fires reliably on 0.29.2.

Two more instances of the same error, for calibration: a memory measurement compared a 4096 MB guest
against a 3072 MB one and read the difference as a code change; and a confident "0 of 12, fixed" came
from a page that could not express the fault, while the page that could was at **10 of 12**.

## What else came out of it

**`A11Y_NVDA_LOG_LEVEL=DEBUG` does not work.** `logLevel = DEBUG` is correctly written under
`[general]` (verified by pulling the file off the guest), guidepup spawns NVDA with no overriding
arguments, and NVDA's log confirms it loaded that config dir — yet the log stays at 7 INFO lines and
records nothing during a capture. The log file also cannot be pulled from the host while NVDA holds it
open; only the in-guest `/diagnostics` can read it. Note guidepup 0.30+ writes a **session** config
(`sessionUserConfig/nvda.ini`) alongside the base one, so anything assuming a single ini is wrong.

**guidepup 0.29 was hiding a real bug.** 0.31 throws when `start()` is called on a live NVDA; 0.29
tolerated it silently. That masked genuine state drift — `capture-core`'s `screenReader.running`
disagrees with reality whenever `screenReaderResponds()` misses the Remote port for an instant, so NVDA
was presumably being double-started for as long as that check has existed. A running NVDA is now
adopted rather than treated as a failure, because NVDA being up is the desired end state and
`ensureSpeechChannel` is the real gate one probe later.

**NVDA settings are recorded, not tuned.** `virtualBuffers.useScreenLayout` is what puts a field, an
embedded object and a button on one line, and turning it off would tidy the residual empty segment away.
It is NVDA's default, and this project captures the lived experience — configuring NVDA away from its
defaults makes the evidence less representative, not more. `/diagnostics` reports the effective settings
so a corpus can state what produced it.
