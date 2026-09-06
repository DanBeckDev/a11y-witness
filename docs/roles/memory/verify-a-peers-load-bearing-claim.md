---
name: verify-a-peers-load-bearing-claim
description: "Re-check a peer's claim myself when being wrong is expensive — pick the one line in their diff that could cost a corpus, and verify that one."
metadata:
  type: feedback
---

Peers on a11y-witness are good and their reports are honest. That is not the question. The question is
which claims I re-derive before merging, and the answer is **the ones where being wrong is expensive**, not
the ones I doubt.

Worked example, 2026-09-06. worker-contracts added a catch-all forwarding any `testCase.probe*` key into
the capture request, and reported: *"checked every one of the 1,645 real cases — none declares a `probe*`
field outside the ten already named, so the catch-all forwards nothing today and moves zero cache keys."*
Plausible, specific, and correct. I ran it myself anyway, because `probe*` fields are CAPTURE CACHE KEY
inputs and a wrong answer there silently re-keys the corpus:

```
node -e 'import("./packages/lab/src/training/case-matrix.mjs").then(({CASES}) => …)'
CASES: 1645 | probe* keys outside the named ten: NONE
```

One command, ten seconds, and it converts "they say" into "I know". **The test is not "do I trust them",
it is "what does this cost if it is wrong".** A stale doc row costs a wrong dispatch; a mis-keyed cache
costs 2,122 captures and hours of fleet time.

**Read the diff for the one line that carries the risk, and verify THAT.** Not the whole branch — the line.
In the same merge I also spotted a comment citing `probe-chain-forwards-by-prefix.test.ts` when the file is
`probe-forward-by-prefix.test.ts`, which is the `pure-graph.test.ts` / `edge-args.test.ts` defect where a
stale name silently disabled a check through an `existsSync` skip. Both found by reading, neither by
distrust.

**Ask HOW, not WHETHER.** "Was that measured or inferred?" gets an honest answer and a usable lesson;
"that's wrong" gets a correction and nothing else. Peers pushed back correctly four times in one night —
including refusing an abstraction I half-implied and refuting three units I had dispatched off stale rows.

See [[rank-a-claim-only-after-reading-it]] for the same rule pointed at my own claims, and
[[orchestrating-peer-sessions]] for why review does not compose across layers.
