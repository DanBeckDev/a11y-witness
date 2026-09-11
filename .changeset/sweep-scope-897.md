---
"a11ign": patch
---

**A sweep now records what it was sealed inside, so `exhausted` in a dialog stops reading as `exhausted`
on the page.**

#887 stopped the report claiming a full page over a collapsed sweep, by comparing trips against the
census. That is the consequence. **This is the cause**: on `runs/781-r1-hubspot.json/capture-1` the
`landmark` sweep's last stop is literally `"Hub Bot, dialog"` — it walked into HubSpot's chat widget and
left the cursor inside an open modal. A screen reader's quick navigation is confined to one, so every
sweep that ran while it was open exhausted the DIALOG, truthfully: `formField` 12 chat-widget controls,
`graphic` 2 Hub Bot avatars, `link` 1 against a census of 79. Then the dialog closed, `list` found the
page's real 22 lists, and the same capture's `heading` sweep found 28 — as many as the healthy captures.
**Nothing was wrong with the page, the worker, the build or the sweep.**

The DOM census reports `openDialog`: the **name** of an open modal, or `null`. `markPageState` already
fingerprints the document before each sweep (#758), so it returns what it read and `collectByType` puts
the scope on the `sweep` mark itself — **no extra round trip**, and the verdict and the scope it is about
are one record rather than two joined by position (#863's finding). `ranOutInsideADialog` then withholds
Requirement 2's full-page sentence, naming the dialog: *"these sweeps ran out of the DIALOG rather than of
the page: link (inside "Hub Bot")"*.

**A string, never a count**, and that is load-bearing: `censusElementCounts` builds the element counts
from every numeric field on a census mark except two, so a numeric `openDialogCount` would arrive
downstream as an element type. A label also points a reader at the thing to go and look at, where a `1`
does not.

**Modal only.** A `role=dialog` without `aria-modal` does not seal quick navigation, and `<dialog open>`
is not `showModal()` — only the second matches `:modal` and only the second is inert-backed. Reporting
either would mark sweeps that were never confined, which is the false-accusation direction.

**Measured on the captures on disk, and the answer is a partial correlation rather than a rate.** By
inference from phrases (the field itself exists on no capture yet), a sweep ends on a dialog announcement
in **9 of 33** captures — eight of them calendly's cookie banner. Cross-tabulated against #887's
trips-short check: **5 end in a dialog and later sweeps run short, 4 end in a dialog and the later sweeps
are fine, 7 run short with no dialog at all.** So the mechanism explains at most 5 of 12 collapses, the
phrase evidence over-reports because `role=dialog` is not `aria-modal`, and **7 collapses have another
cause still unaccounted for**. *A local `runs/` copy, so this is a PRE-CHECK; the authoritative figure is
the fleet operator's.*

**A worker deploy is required before any capture carries the field**, so the fixture proves the defect
happened and the synthetic-DOM test proves the field detects it — joining them needs one capture taken
after the deploy.
