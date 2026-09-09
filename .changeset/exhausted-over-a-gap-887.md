---
"a11ign": patch
---

**A link sweep reported `exhausted` — the one stop reason this codebase treats as authoritative — after 8
trips, having found 1 link on a page whose own census counts 79. The report then rendered "every
structural sweep ran until the page ran out of elements".**

**The cause is in the capture's own phrases.** The `landmark` sweep before the collapse ends on
`"Chat Widget, region, ... Open live chat, button, opens dialog"` and then `"Hub Bot, dialog"` — it walked
into HubSpot's chat widget and left the cursor inside an open dialog. Every sweep that ran while it was
open exhausted that dialog, truthfully:

```
formField  12 found — every one a chat-widget control ("Ask me anything...", "send message",
                      "Resize widget height or width", "Close live chat")
graphic     2 found — "Avatar of Hub Bot", "Message History ... Avatar of Hub Bot"
link        1 found — "privacy policy, link"
```

Then the `list` sweep found the real page's 22 lists and the `frame` sweep saw the widget as
`"... opens dialog"` — closed again. **Nothing was wrong with the page, the worker, the build or the
sweep**, and the same capture's `heading` sweep found 28, exactly as the healthy captures did.
`exhausted` is NVDA's own "no next link", and it is true about wherever its cursor is. This is #863's
finding one probe over: a verdict about a scope nobody recorded.

**The check names the number it compares and needs no threshold: a sweep cannot have visited more elements
than it made trips.** 8 trips against a census of 79 is arithmetic. `ranOutShortOfTheCensus` reports every
sweep whose directions both ran out while its total trips fall short of the same capture's census for that
type, and Requirement 2 withholds the full-page sentence, naming the numbers:
*"link (1 found in 8 trips, census 79)"*.

**It withholds a claim rather than asserting incompleteness, and the sentence says so.** The census counts
AX nodes in roles a quick-navigation key may never reach — #800's finding about `formControl` and `f` — so
short trips do not prove anything was missed. They prove the affirmative claim is not supported.
Withholding needs doubt; asserting needs proof.

**This is already on disk, and not rarely.** Run over every capture in one checkout's `runs/`, **14 of 32
captures would lose the full-page claim** — including four captures of `theregister.com` reporting
`link 0 found in 6 trips` against a census of **788**, each of which currently renders a full-page
completeness sentence. *That reads a local copy of `runs/`, so it is a PRE-CHECK: the authoritative number
belongs to whoever drives the fleet and the lab.*

Gated on the presence of `prevTrips`/`nextTrips`: a capture that does not record them cannot answer this
question and is not made to. Only sweeps whose BOTH directions ran out are considered — a half-exhausted
sweep is already truncated and `truncatedSweeps` reports it, and counting it here would report one
capture's incompleteness twice.
