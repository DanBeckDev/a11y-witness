# The style the board document is written to

The two files beside this one are the specification, copied into the repository on 2026-09-06 so the
document is checked against them rather than against somebody's memory of them. They arrived as board
feedback on the first edition, which read like an engineer's post-mortem.

`board-style.test.ts` enforces the mechanical half **on the rendered document, never on the template** —
a template can satisfy a rule that its output then breaks, and it is the output the board reads.

## What binds, and what deliberately does not

**From `executive.md`, all of it.** Answer first, up to three reasons, evidence underneath, every heading
a claim, numbers over adjectives, and never round the number that makes a claim actionable.

**From `eli15.md`, the plain-language half only.** Its analogy rules do **not** apply: an analogy in a
board document invites a decision to be made about the analogy. What does apply is *keep the substance,
change the words*, define every piece of jargon in the sentence it appears in, and never write "just" or
"simply".

## The two rules that are specific to this document

1. **The first sentence of the document, and of every section, is a complete answer someone could act
   on.** Not a topic. *"First publish is dated 20 September and is at risk because one blocker has no
   known size"* is a first sentence; *"Are we on track"* is not.

2. **Sections one to five carry no repository internals.** No file names, no line numbers, no commit
   identifiers, no branch names, no issue numbers, no code spans, no command names. The board reads
   outcomes and decisions. Every such reference in the first edition told them the product manager was
   pointing at files instead of managing the product. Identifiers live in the appendix, described in
   words — *"the project's issue tracker"* — with the exact reference beside it for anyone who checks.

The jargon this project uses without noticing, all of which must be defined where it appears: **recapture,
gate, corpus, protocol, milestone, worker, blocker, fixture, promotion**.
