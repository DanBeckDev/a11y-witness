# ADR 0036: The layer model — a source of evidence, and which packages may claim one

## Status

Accepted 2026-09-06, the chairman's amendment ahead of the `a11ign` rename (issue #66): the product is
becoming an all-in-one accessibility solution rather than a screen-reader tool, and the package split must
say so before the rename gives every current name the appearance of permanence.

## Context

This repository's packages were named while there was exactly one non-rule evidence source: a real screen
reader. `nvda-worker`, `scorer` and (privately) `nvda-speech` name that source directly, which cost nothing
while it was the only one — a package name and its contents agreed by construction.

They will not agree once a second one exists. The product direction is `a11ign`, an all-in-one solution
whose stated future sources include keyboard-only operability, contrast/visual checks, cognitive load, PDF
accessibility and mobile — each a genuinely different way of finding out whether a page is accessible, not
a variation on NVDA. Renaming the tree to `a11ign` (#66) without first deciding which packages may name a
specific evidence source and which must stay neutral would carry the current, accidental one-source naming
forward as if it were a decision, and every later addition would either break the pattern immediately or
extend it by growing exceptions.

**The report already draws this line, in two places, without a name for it.** `packages/cli/src/report.ts`
prints axe's section under the literal heading `"-- Rule-based layer (axe-core): contrast, colour, ARIA,
parsing --"` (line 63) — axe's findings are structurally separate from the judge's, carried in `Report.axe`
rather than `Report.verdict.findings` (`report.ts:29-30`). And ADR 0021 already states the rule *"the layer
that decides a subtype must be the layer allowed to claim it"* for the split inside the judge's own findings
— rules versus the trained scorer, tracked per subtype in `rule-ownership.json`'s `decidedBy`. Both are the
same fact, stated twice, with no name connecting them to each other or to what a THIRD evidence source would
need to do to join. This ADR is that name.

## Decision

**The product is `a11ign`. A layer is a source of evidence about a page.** Three exist today:

| layer | what it reads | today's packages |
|---|---|---|
| **deterministic rules** | structural/DOM absence facts a checker can read directly (`judge`'s `rules.ts`) | `judge` |
| **screen-reader capture** | what NVDA actually announces, plus the trained scorer that triages what a rule cannot decide directly | `nvda-worker`, `worker-fleet`, `scorer`, `nvda-speech` |
| **rule/visual (axe-core)** | contrast, colour, ARIA, parsing — third-party, run alongside, never absorbed into the judge's own findings | (no in-tree package; a dependency `judge`/`cli` call out to) |

**Every finding already carries which layer produced it.** Not as a field on `Finding` — this decision does
not add one — but structurally: an axe finding lives in `Report.axe` and nowhere else, and a judge finding's
layer (rule versus scorer) is recoverable from `rule-ownership.json`'s `decidedBy` for its subtype. This ADR
names that existing property so a fourth layer joining later has a contract to match rather than a pattern
to reverse-engineer from two examples.

**A new layer joins by the same contract**: its own evidence-producing package(s), reported through the same
`Report` shape (a new field alongside `axe`, or a new `decidedBy` value, whichever the evidence's shape
calls for), never folded into an existing layer's findings just because it is convenient at the time.
Keyboard-only, contrast/visual, cognitive, PDF, mobile — whichever comes first, this is its contract.

### Which packages are PRODUCT and which are LAYER

**Rule: a layer package carries its layer's name; a product package never names a layer.** Applied to the
current split (`packages/README.md`'s M1–M8 table plus the three private packages):

| current name | new name | why |
|---|---|---|
| `evidence` | `@a11ign/evidence` | wire types and WCAG data every layer and the product read — layer-neutral by construction |
| `judge` | `@a11ign/judge` | decides ACROSS layers (`rule-ownership.json`, `layers.ts`'s ordering, `outcomes.ts`) — naming it after either the rules or the scorer would misdescribe the half it does not own |
| `scorer` | `@a11ign/screenreader-scorer` | the trained heads exist because NVDA's announcements need triage; a keyboard-only layer would need a different model or none |
| `nvda-worker` | `@a11ign/screenreader-worker` | drives NVDA specifically; its HTTP contract and `CAPTURE_PROTOCOL_VERSION` are about screen-reader evidence, not evidence in general |
| `worker-fleet` | `@a11ign/screenreader-fleet` | lease/health/capacity for the NVDA fleet; touches no other layer's infrastructure (its own README already says so) |
| `nvda-speech` (private) | `@a11ign/screenreader-speech` | NVDA's announcement grammar, GPL because derived from NVDA — named for publication even while it stays private, so it does not need renaming twice |
| `a11y-witness` (the CLI) | **`a11ign`**, unscoped | see below — the one name the issue itself flagged as inconsistent |
| `control` (private) | unchanged | internal control-plane orchestration, never published — the naming rule governs published names, not internal-only ones |
| `lab` (private) | unchanged | internal corpus/training pipeline, never published — same reason |

Axe itself is a dependency, not an in-tree package, so it needs no entry — the rule only governs packages
this repository publishes.

### The CLI: unscoped, and it becomes the product's own name

**`@a11ign/cli` is wrong, and it is wrong for the reason `packages/README.md` already gives for the current
name**: *"unscoped so `npx a11y-witness` needs no wrapper."* Scoping the CLI makes the entry point
`npx @a11ign/cli`, directly contradicting the rename's own decision that *"the command-line binary is
`a11ign`"* — and the first command in a stranger's two-hour path is `npx a11ign`, not a scoped package name.

**Decision: the CLI package stays unscoped and becomes `a11ign`, binary `a11ign`.** It satisfies this ADR's
own rule — a product package, naming no layer — and keeps the one entry point that must be typable by
someone who has never seen this repository. This is the one place the issue's own proposed names conflicted
with its own stated principle, and the principle wins.

## A collision this decision creates, named so #66 does not have to rediscover it

**`judge/src/layers.ts` already exports `ExperienceLayer`, `layerOf`, `orderByLayer`, `LAYER_LABEL` — and
none of that is this ADR's "layer".** That module's layer is Ashley Firth's Perceive → Navigate → Interact
waterfall, a way of ORDERING findings for display; this ADR's layer is a SOURCE of evidence. They are
unrelated concepts sharing one English word, and `report.ts` imports both into the same file (`layerOf`,
`orderByLayer`, `LAYER_LABEL` from `@a11y-witness/judge/layers` at the top, `"-- Rule-based layer (axe-core)
..."` a few lines below) — a reader already has to hold both senses apart with nothing marking which is
which.

**Not fixed here — this ADR is names and contracts, not code.** But it should be fixed once, deliberately,
rather than accumulate a second layer package (`@a11ign/screenreader-*`) that a reader must also
disambiguate from `ExperienceLayer`. The rename in #66 is the right moment: renaming `layers.ts`'s exports
to something in the waterfall's own vocabulary — `ExperienceStage`/`stageOf`/`orderByStage`, or similar —
costs nothing extra once every other cross-package specifier in the tree is already changing, and costs a
dedicated unit if left for later. Recorded here so #66 inherits the decision rather than the discovery.

## What a real package split would cost, and when it would be worth it

**No code restructuring is decided here.** `scorer`, `nvda-worker`, `worker-fleet` and `nvda-speech` do not
move, merge, or gain a shared base package today — only their published names and the vocabulary for
describing them. A literal "layer" abstraction in code (a shared interface every evidence source
implements, a registry a layer plugs into) is a larger, separate decision, and this ADR states its price
rather than making it:

- **A shared layer interface would need to unify two genuinely different evidence shapes** — the judge's
  synchronous, in-process `Finding[]` versus the screen-reader layer's asynchronous, worker-mediated capture
  (`CaptureResponse`, minutes of wall-clock, a fleet). Forcing both through one interface today would mean
  either weakening the capture layer's async contract or complicating the judge's, for a benefit ("a fourth
  layer plugs in without touching `report.ts`") that has no second layer yet to prove it against.
- **It is worth doing once a second REAL layer (not axe, which is a dependency, not an in-tree layer) is
  built** — at that point there are two concrete shapes to design the interface against instead of one
  concrete shape and a guess. Building it now would be designing for a layer that does not exist yet, which
  this repository's own conventions already caution against.
- **The naming rule this ADR states does not depend on that restructuring happening at all.** A package can
  carry the right name under the current, un-unified architecture indefinitely; the naming decision and the
  code-restructuring decision are independent, and this ADR is only the first.

## Consequences

- `packages/README.md`'s M1–M8 table gains the new names, so the rename branch (#66) has a checklist rather
  than a rediscovery — done in this same change.
- `docs/adr/README.md`'s index and the ADR-count prose in `docs/README.md`/`CLAUDE.md` gain this ADR, per
  `adr-index.test.ts`'s pinned count.
- The next new evidence source (keyboard-only, contrast/visual, cognitive, PDF, mobile) has a naming
  contract to satisfy before its first package is registered, rather than a precedent to infer from two
  examples that happen to agree by accident.
- #66's blast-radius table (8 binaries) still needs its own per-binary naming pass; this ADR does not name
  them individually, but the SAME rule applies: a binary published from a layer package carries that
  layer's name, exactly as its package does, and a binary published from a product package does not.

## What would falsify this

If a genuinely cross-layer package turns out to be needed before a second real layer exists — for example, a
shared capture-orchestration abstraction that the rule layer also wants to use — the "wait for a second real
layer" reasoning above should be revisited with that concrete case in hand, not deferred on the strength of
this ADR alone.
