---
"@a11ign/nvda-worker": minor
"@a11ign/evidence": patch
---

A capture now carries `formInputs`: one `{ tag, type, autocomplete }` entry for each form control on the
page (`input` except `type=hidden`, `select` and `textarea`). The value is read from the DOM at the same
moment as `media`.

- `autocomplete` is the **attribute** as the author wrote it, or `null` when the control has none. It is
  never the normalised property, which returns `""` for a token the browser does not recognise.
- `null` for the whole field means the census did not run, and `[]` means the page has no form control.
- A `formInputCensus` diagnostic mark records `count`, `total` (the list is capped at `FORM_INPUT_CAP`) and
  which document was read.

This is the evidence 1.3.5's rule (`addUnidentifiedInputPurpose`) has been declared against, and it had no
source until now. `CAPTURE_PROTOCOL_VERSION` moves from 16 to 17, because a new field that a rule and a
signal read is that constant's trigger. Deploying it needs `--allow-protocol-change` and forces a full
recapture.

`@a11ign/evidence`'s `CaptureResult` type now names `formInputs` beside `media`, with the same contract.
