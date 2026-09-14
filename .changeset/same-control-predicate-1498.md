---
"@a11ign/evidence": patch
"@a11ign/judge": patch
---

**`sameControlAnnounced` is now exported from `@a11ign/evidence`, as its one definition.** It is the #812 check that asks whether a before/after announcement pair is about one control.

- **Who imports it:** the judge's 4.1.2 rule and the lab's corpus signal both import it, instead of each keeping a copy pinned equal by a test.
- **The decision is moved, not altered:** a pair is the same control when both sides announce the same non-empty name, whatever their roles.
- **#1496's pairs** read the same before and after (#1498).
