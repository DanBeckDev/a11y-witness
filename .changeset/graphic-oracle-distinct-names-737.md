---
"@a11ign/nvda-worker": patch
---

The `structureCrossCheck` diagnostic mark's `oracleDistinctNames` field for `graphic` no longer
counts unnamed images as distinct names. On a page with unnamed graphics it previously reported the
raw element count (each nameless image counted as its own "name"), inflating the reported gap
against the sweep by however many unnamed images the page has — measured 61 vs. the real 23 on a
calendly capture with 38 unnamed graphics. Not a wire-protocol change: no capture field is renamed,
added, or removed, and no host needs to change how it reads a capture. A consumer reading
`structureCrossCheck.differsOn` for `graphic` will see a smaller, more accurate number.
