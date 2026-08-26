---
"@a11y-witness/scorer": major
---

Promote the v15 screen-reader scorer, and close the schema migration it was opened for.

`screenreader-structured-v7` -> `screenreader-structured-v15`. The migration was declared on 2026-08-24
when the featurizer began reading the announcement parse instead of re-deriving the grammar in Python,
and when 2.4.4 stopped reading whether a link's TEXT is vague (2.4.9's question, a AAA criterion this
project does not report) and started reading whether it lacks CONTEXT.

Held-out acceptance passes with no false positives and no false negatives on 1.3.1, which is the criterion
that blocked every previous candidate. Calibration blockers went from six to zero.

Three fixes stand behind that, each measured rather than argued:

- **The NP order statistic is a FLOOR, not the answer.** `s_(r*)` is the lowest cut satisfying the type-I
  bound, which buys no power where recall is flat and spends the whole false-positive budget for nothing.
  Twelve of seventeen heads were on a dominated cut; `2.4.4:regex` moved 0.069 -> 0.832 and went from four
  development false positives to zero at identical recall.
- **A container EXIT read as a role.** NVDA announces `"out of table, Borrowing books"` when leaving a
  container to read prose, and `plain_heading_candidate` rejected it because `table` is a role word. 13 of
  108 records labelled `1.3.1:fake-heading` carried no evidence for the label as a result.
- **A subtype whose SUBJECT is absent is now inapplicable rather than scored low.** A linear head only
  adds, so a zero feature can never veto.
