---
name: rank-a-claim-only-after-reading-it
description: "Before giving a finding a severity or a rank, check it against the artefact — or send it labelled as a hypothesis with the check named."
metadata:
  type: feedback
---

Twice on 2026-09-06 I escalated a finding with a rank attached, on a mechanism I had **reasoned** rather
than **read**, and both were wrong:

- **"the 10 conformant-record failures are 2.1.2"** — inferred from the case names
  (`keyboard-trap-modal-*`). `rules:gate` names failing RECORDS, not criteria. It was 2.4.7. A peer spent
  an evening correctly investigating the wrong rule because I stated the inference as fact.
- **"the Action's NVDA cache key describes the CLIENT, not the screen reader"** — the client DETERMINES
  the screen reader, via a manifest shipped inside the lockfile-pinned `@guidepup/guidepup` naming the
  exact build under a sha256. A peer found it by pulling the installer's tarball and reading its source
  instead of its `--help`.

Both were caught by somebody going and looking. Neither cost anything permanent, only because they were
written down and then checked.

**The rule, from the CEO and worth keeping:** before a claim reaches a decision-maker *with a rank*, it
has been checked against the artefact. If it has not, it arrives **labelled as a hypothesis, with the
check that would settle it named.** I already do this for numbers — "was that measured or inferred?" —
and the discipline has to extend to mechanisms.

The same day, a prediction I recorded BEFORE the result ("the real-page gate will report new 2.4.7
findings, because cookie banners are focus traps") was refuted within the hour by fetching three pages.
That one cost nothing precisely because it was labelled a prediction and checked. The distinction that
killed it is worth having too: a trap that **CONTAINS** focus by tab order is not a trap that
**RELOCATES** focus on `focusin`, and only the second produces the 0 ms pair.

See [[orchestrating-peer-sessions]] — "ask HOW a number was obtained, not just whether it is right" is the
same rule pointed at a peer instead of at myself.
