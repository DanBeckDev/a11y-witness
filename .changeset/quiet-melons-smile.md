---
---

Release machinery only — no consumer-visible change. The packaging work in this change (Changesets, the
changeset CI check, and the dispatch-only release workflow) publishes nothing and alters no API.

Kept as an empty changeset rather than none, because `changeset status` treats "no changeset" and "a
deliberate decision that this needs no release" as the same silence, and this repo's rule is that those
must never look alike.
