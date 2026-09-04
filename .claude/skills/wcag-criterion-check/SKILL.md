---
name: wcag-criterion-check
description: Read a WCAG success criterion against its OFFICIAL text before writing, changing, or judging any rule about it. Use whenever work touches a WCAG criterion — adding a rule, changing what a criterion reports, classifying one as out of scope, writing a corpus case for one, or reviewing any of those. Fetches the Understanding page, the normative definitions of every defined term, and the ACT rules, then compares them against what this repo claims.
---

# Read the criterion before you reason about it

**This skill exists because a criterion was argued about for a day and got the wrong answer, and the
reason was that nobody had read its definition.**

3.1.2 Language of Parts asks that the language of each passage "can be **programmatically determined**".
That phrase is a link, and WCAG defines it: *"determined by software from AUTHOR-SUPPLIED DATA provided
in a way that different user agents, including assistive technologies, can extract and present this
information to users in different modalities."*

So the question 3.1.2 asks is **"did the author supply data the AT can extract?"** — not "what language is
this text?". Answering the second one led to "this needs language detection, so no layer can decide it",
which was written into `rule-ownership.json`, `criterion-coverage.ts`, `known-gaps.md` and the backlog,
and was wrong in three of the criterion's four cases. Reading one linked definition would have prevented
all of it.

**The failure mode is specific and it is not laziness: it is answering a plausible paraphrase of the
criterion instead of the criterion.** A paraphrase drops the defined terms, and the defined terms are
where the criterion actually lives.

## When to run this

Any of these, before writing code or prose:

- adding or changing a deterministic rule, or a model subtype, for a criterion
- moving a criterion between `assessed` / `partial` / `reachable` / `out-of-scope`
- declaring a subtype `decidedBy: "rules"` / `"unavailable"` in `rule-ownership.json`
- writing a corpus case, or explaining why one cannot exist
- reviewing any of the above — including your own

## The procedure

### 1. Fetch the criterion's own page

```
https://www.w3.org/WAI/WCAG22/Understanding/<slug>
```

The slug is the criterion's name lower-cased and hyphenated: `language-of-parts`, `name-role-value`,
`error-identification`, `focus-order`. Read, and write down verbatim:

- the **success criterion text**, exactly
- **every defined term in it** — the linked ones
- the **exceptions** ("except for …"). They are normative and they are where over-firing comes from
- **Sufficient Techniques** — what satisfying it looks like
- **Failure Techniques** — what failing it looks like. Some criteria have none listed; note that
- anything the page says about **how to evaluate it**

### 2. FOLLOW EVERY DEFINED TERM. This is the step that gets skipped

Defined terms are hyperlinked and their definitions are normative. `programmatically determined`,
`accessibility supported`, `user interface component`, `mechanism`, `set of web pages`, `same
functionality`, `essential`, `large scale`. **A criterion is not read until its defined terms are read.**

Fetch each one and quote it. If a definition changes what the criterion is asking — as
`programmatically determined` does for 3.1.2 — that is the finding, and it outranks anything you had
reasoned before.

### 3. Fetch the ACT rules for it

```
https://www.w3.org/WAI/standards-guidelines/act/rules/
```

Filter to the criterion. For each rule read **applicability**, **expectation**, **assumptions** and the
**passed / failed / inapplicable examples**. The examples are the cheapest correction available: they are
concrete pages with a stated outcome, and if this repo's rule would disagree with one, that disagreement
is a defect in this repo until argued otherwise.

`packages/judge/src/act-rules.ts` describes OUR rules in ACT format. It is deliberately not a claim to
implement the community rules — but where one exists for the same criterion, its applicability and
assumptions are the review this repo's rule has not otherwise had.

### 4. Enumerate the criterion's FAILURE CASES separately

Not "can we decide this criterion" — **which distinct ways can a page fail it, and who decides each one?**

Collapsing the cases is the error 3.1.2 taught. Four cases existed; the corpus happened to hold the one
undecidable one; the conclusion was written about the whole criterion. Build the table instead:

| failure case | evidence it needs | which layer has that |
|---|---|---|

The layers are: **screen reader** (this tool), **DOM / rules** (axe-core, which this tool runs alongside
and not instead of), **visual**, **human judgement**, **multi-page**. A criterion is `partial` when some
cases are ours and some are not — which is the common answer, and is why `partial` exists.

### 5. Compare against what this repo claims

Read all four, because they drift independently and each is a separate copy of the claim:

| where | what to check |
|---|---|
| `packages/judge/src/criterion-coverage.ts` | the `status`, the `needs`, the `channels`, and whether the `note` still describes the criterion you just read |
| `packages/lab/rule-ownership.json` | `decidedBy` per subtype, and whether the `note` argues from the real criterion |
| `packages/judge/src/act-rules.ts` | applicability and expectation against the SC text and the ACT rule |
| `packages/judge/src/rules.ts` | what the rule actually fires on |

### 6. Report discrepancies as findings, with the quote

Every discrepancy names the criterion text or definition it contradicts. "Our note says X, the criterion
says Y" — quoted, not paraphrased, because a paraphrase is what caused this.

## Rules that apply to the whole procedure

- **Quote, never paraphrase.** The paraphrase is the defect.
- **An exception in the criterion is a rule you must NOT fire on.** 3.1.2 exempts proper names, technical
  terms, words of indeterminate language, and vernacular borrowings. 2.4.1 does not require a skip link at
  all — headings alone satisfy it (H69), landmarks alone satisfy it (ARIA11) — and a rule detecting its
  absence would fire on every conformant page. That one was caught; it is the shape to look for.
- **"Not alone" is not "not at all".** W3C says auditors "cannot solely rely on the spoken output from
  assistive technologies, but must verify … in the underlying code or markup". Reading that as "speech
  cannot contribute" is what removed three decidable cases from 3.1.2.
- **Check the premise before the expensive thing.** If a corpus run, a recapture or a retrain is about to
  be spent on a criterion, do this first. It costs one fetch; they cost hours.
- **Record the reading where the claim lives**, so the next reader inherits it rather than repeating it —
  and quote the source URL.
