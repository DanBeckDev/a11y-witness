---
"@a11ign/nvda-worker": patch
---

Each structural sweep's `observed` record now says where focus sat when that sweep started. It gives one
of four answers:

- `focusInFrame: "<frame>"`: focus was inside a nested browsing context (`<iframe>`, `<frame>`,
  `<object>`, `<embed>` or `<fencedframe>`), named by its title, name or id, or else its source's host.
- `focusInFrame: null`: focus was in the top document.
- `focusInFrameUnknown: "<why>"`: the page could not say. For example, focus was on a host whose closed
  shadow root page script cannot read.
- Neither field: the page could not be read.

The page side is a `focusFrame` value on the DOM census that every sweep already reads, so this adds no
round trip. It follows open shadow roots to the element focused inside them.

This is a diagnostic only. It changes nothing a capture does, and no rule or signal reads it, so
`CAPTURE_PROTOCOL_VERSION` is unchanged. Captures already on disk have neither field, which reads as not
recorded.
