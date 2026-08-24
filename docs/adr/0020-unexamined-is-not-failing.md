# 0020 — Unexamined is not failing: evidence completeness gates absence claims

**Status:** accepted 2026-08-24

## Context

The scorer reported `1.3.1:unassociated-table` at **0.946** on `w3.org/WAI/demos/bad/after/survey.html` —
the page W3C publishes as the *fixed* version of its own bad demo. The evidence:

    transcript             "table, with 3 rows and 7 columns, caption, What is your favorite …"
    transcript             "row 2, , column 1, hate it"
    structure.tableCells   []                       <- the cell sweep recorded NOTHING

The page announced 21 cells, the capture examined two, and both were row-header cells, which have no header
to announce. The model saw cells announced by position with no header name and called the table
unassociated. **It was reading UNEXAMINED as FAILING.**

Two narrower fixes were attempted and measurement rejected both, which is why this is a gate and not a patch:

| attempted fix | measured result |
|---|---|
| guard column 1 as `TABLE_DATA_ROW` already guards row 1 | position-only evidence on corpus failures fell **122 → 0** — it would have destroyed the signal |
| require "no associated rows anywhere" | the conformant page and all 61 corpus failures score **identically** |

They are indistinguishable from the evidence. The difference is not in the page; it is in how much of the
page the capture managed to examine.

## Decision

**Gate findings on evidence completeness, deterministically, outside the model — and only for claims that
range over a whole channel.**

1. `evidenceCompleteness(capture)` compares what the page said was there against what the sweep recorded.
   The numbers come from **NVDA's own words**: it announces a table's dimensions, and the worker already
   records a `structureCensus` from the Elements List (present in 200 of 200 corpus captures sampled).
2. `CRITERION_EVIDENCE` declares, per criterion, the channel its finding ranges over. It is deliberately
   short — **1.3.1 on `tableCells`, and nothing else** until another criterion is shown to make an absence
   claim.
3. A finding whose channel is incomplete is reported **INCONCLUSIVE**: never an accusation, never a pass.

**The axis is presence versus absence, and getting it wrong is the interesting part.** The first version
gated 1.1.1 on the graphics channel and withheld it on all three W3C "before" pages — the canonical
missing-alt demos — because the sweep saw 8 of 31 graphics, when unnamed graphics had already been found
among those 8.

| | |
|---|---|
| **presence** — "here is an unnamed graphic" | one instance proves it; 8 of 31 is enough |
| **absence** — "no cell announces a header" | ranges over all cells; 0 of 21 cannot support it |

Completeness bounds a claim about everything in a channel and says nothing about a claim that something
exists. Withholding a presence finding trades a false accusation for a false clean, which is not an
improvement — it is the same defect facing the other way. This is CLAUDE.md's most expensive rule ("a check
must never reject evidence whose absence is the finding") pointed at the *finding* rather than the evidence.

## Consequences

- **The candidate reaches 0 false accusations on 18 conformant real pages while catching 3 of 3
  publisher-declared inaccessible pages**, against the shipped model's 0 and 2 of 3. Two findings are
  withheld, both `1.3.1` where the table sweep saw 0 cells.
- **Zero effect on the corpus**: 2,122 captures, 0 withholdings. Any suppression there is a bug in the gate
  rather than a finding, which is what makes the change testable.
- **No retrain can regress it**, because it is not in the model. No recapture and no
  `CAPTURE_PROTOCOL_VERSION` bump either: it reads what is already on disk.
- **Recall cost on large pages is real and deliberate.** A page whose table sweep truncates gets no 1.3.1
  verdict. The remedy is more capture budget and adding `table` to the census (it covers four types and not
  tables); budget is a mitigation, the gate is the guarantee.

## Alternatives rejected

- **An "evidence incomplete" feature the model learns from.** Impossible in principle here, not merely
  awkward: the corpus cannot express incomplete evidence — 122 of 122 table captures are complete, because
  corpus pages are small. The feature would be constant zero across every training record, a starved feature
  and ADR 0015's free veto, which `npm run corpus:starvation` would flag on day one. **A head cannot learn
  to withhold on a condition it has never once seen.**
- **Lower the abstention floor, or lean on it.** The floor asks *"is this page like my training data?"* —
  that page scored 0.83, comfortably in support. This asks *"did the capture examine the thing being
  accused?"*. Two different questions; only the first was ever being asked, which is precisely why
  abstention could not have caught this.
- **Exclude `tableCells` from the model, as `links`, `lists` and `graphics` already are.** That removes a
  working subtype with 61 corpus positives to fix a case where the evidence was merely absent, and it would
  not help the next channel.
- **Raise the sweep budget and call it fixed.** It reduces how often the case arises and guarantees nothing;
  a page can always be larger than the budget. Worth doing as well, never instead.

## What would falsify this

If a page with a complete table sweep were still accused wrongly, the gate would be addressing the wrong
variable. And if withheld findings on real pages turned out to be overwhelmingly TRUE when captured with
more budget, the presence/absence line is drawn in the wrong place — testable directly by recapturing the
two withheld pages with a larger budget and scoring them again.
