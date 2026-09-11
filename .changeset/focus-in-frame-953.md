---
"@a11ign/nvda-worker": patch
---

Each structural sweep's `observed` record now carries `focusInFrame`: where focus sat when that sweep
started. It is the name of the frame holding focus (its title, name or id, or else its source's host), or
`null` when focus was in the top document. The field is absent when the page could not be read. The page
side is a `focusFrame` string on the DOM census that every sweep already reads, so this adds no round trip.
It follows a shadow host to the element focused inside it.

This is a diagnostic only. It changes nothing a capture does, and no rule or signal reads it, so
`CAPTURE_PROTOCOL_VERSION` is unchanged. Captures already on disk have no `focusInFrame`, which reads as
not recorded.
