---
"@a11ign/evidence": patch
---

**Conformance Requirement 2 now says what each layer examines inside iframes.** Before, it said "iframes not
entered" or "content inside iframes is not entered".

That was false for both layers. The rule layer (axe-core, through `@axe-core/playwright`) examines iframe documents,
so its findings can come from inside one: V1 rehearsals 3–5 reported three, addressed `["iframe", …]`. The screen
reader's read-through and sweeps can pass into a frame's content.

The sentence, shared by all five branches of Requirement 2, now reads:
- **The screen-reader layer:** its read-through and sweeps can pass into a frame's content, but nothing inside a
  frame or embedded object is operated, and the page's element counts come from the top document only.
- **The rule layer:** when it ran, it examines iframe documents too; when it did not run, the sentence says so.

Nothing about what either layer examines has changed (#1438).
