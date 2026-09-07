---
---

CI-only: the `board` job now declares `GH_TOKEN`, and a new test pins the class — any ci.yml job whose tests can reach a `gh` spawn, transitively through local imports, must carry it. No consumer-visible change.
