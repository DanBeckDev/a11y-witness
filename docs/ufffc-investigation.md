# The U+FFFC artefact — what is known, and what is not

An OBJECT REPLACEMENT CHARACTER (U+FFFC, `￼`) intermittently appears appended to form-field
announcements:

```
"Postcode, edit, ￼, button, Book parcel"     instead of     "Postcode, edit, button, Book parcel"
```

It is **pre-existing, not a regression** — present in the corpus for weeks at 3–31% of affected
captures depending on environment, and in **26 good/bad pairs one variant carries it and the other does
not**. That last point is why it matters: those pairs are compared across evidence differing for a
reason unrelated to accessibility, which is the one defect this project cannot tolerate.

Overall exposure is roughly **1.7% of the corpus** (36 of 2,122 captures; 6.8% of the 532 form/field
captures).

## Reproduction — verified, use this

```bash
# fires ~1 in 15. Any page whose label is personal-data-like: Postcode, Recipient name, Visit date.
curl -s -X POST http://<worker>:8765/capture -H 'content-type: application/json' \
  -d '{"url":"http://192.168.64.1:5050/form-error-silent-postcode/bad","probeForms":true}'
```

**Do not verify a fix on `form-error-silent/bad`.** Its label is "Reference number", it cannot express
the fault, and it returns 15/15 clean regardless. Three separate "fixes" were declared working against
pages incapable of failing — that is the single most expensive mistake in this investigation.

## Ruled out, each with evidence

| theory | how it died |
|---|---|
| Render race on `<input type="date">` picker | the fixture is `type="text"`; there is no picker |
| Edge autofill learning from `probeForms` | reproduces on capture 1 of a fresh browser session |
| Edge policy (`AutofillAddressEnabled=0`) | applied and verified live; still ~7% |
| Launch flags (`AutofillServerCommunication`, …) | applied; still ~7% |
| Deleting `Web Data`/`Login Data` at boot | applied; still ~7% |
| Chromium's AX tree still settling | tree signature byte-identical from `loadEventFired` to +2000ms |
| DOM mutation from the form submit | artefact is in the read-through, which runs BEFORE `formProbe` |

## What that leaves

**Chromium is deterministic here.** Same page, same stable accessibility tree, every time — and NVDA's
output still differs ~7%. The variance is inside **NVDA's virtual-buffer construction**.

Supporting detail from `Accessibility.getFullAXTree` on the failing page: the textbox always has a child
`{role: generic, name: "", editable: plaintext}` — Chromium's inner editable div. It is present on every
capture, including clean ones. NVDA sometimes collapses it into the edit field and sometimes emits the
embedded-object placeholder for it.

Consistent with nvaccess/nvda#11177, where NVDA's U+FFFC announcement rule was changed and the fix is
noted to have "introduced other problems in Chromium-based browsers".

## Instruments — one is broken, one is untried

**`A11Y_NVDA_LOG_LEVEL=DEBUG` does not work.** `logLevel = DEBUG` is correctly written under `[general]`
(verified by pulling the file off the guest), guidepup spawns NVDA with **no** arguments so nothing
overrides it, and NVDA's own log confirms it loaded that exact config dir — yet the log stays at 7 INFO
lines and records nothing during a capture. Also note the log file cannot be pulled from the host while
NVDA holds it open; only the in-guest `/diagnostics` can read it.

**guidepup 0.30.0 added a settings API** — `start({ settings })`, `getSettings()`, `getSetting(key)`,
keyed as `section.key` (their example: `virtualBuffers.autoSayAllOnPageLoad`). 0.31.0 adds
`nvda.version`. We are on **0.29.2**. This is the supported way to set NVDA config, including
`general.logLevel`, and 0.30+ writes a **session** config rather than the base `userConfig/nvda.ini`
this repo currently patches.

`virtualBuffers.useScreenLayout` is worth investigating: it is what places the field, the object and the
button on a single line, which is the shape the artefact appears in. Currently unset, so NVDA's default
applies.

## Next steps, in order

1. Upgrade guidepup 0.29.2 → 0.31.0 **on one guest only**. Note 0.29.0's breaking change: assets are
   manifest-driven and need `@guidepup/setup` 0.24.0+.
2. Use the settings API to set `general.logLevel = DEBUG`, reproduce, and read NVDA's own account of
   what it did with that node. This is the first instrument that would show the cause rather than the
   symptom.
3. `npm run evidence:check` before the upgrade goes fleet-wide. guidepup drives every keystroke and
   reads every phrase; an upgrade is an evidence change until proven otherwise.
4. Only then attempt a fix, and verify it against the reproduction above.
