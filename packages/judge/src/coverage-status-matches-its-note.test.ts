/**
 * Does any criterion claim `assessed` while its own note says part of it is not covered?
 *
 * ## #251, and why a status is a claim rather than a label
 *
 * `4.1.3` read `status: "assessed"` while its note — four hundred characters in — said *"ONE of the
 * criterion's FOUR categories"* is covered, and named the two that are not. Either the status was wrong or
 * the note was, and **a reader could not tell which.**
 *
 * `status` is what the report prints and what the coverage count sums, and that count is a public number:
 * it reaches the board document and the report a stranger reads. The note is where the truth was.
 *
 * `2.4.2` is `partial` for strictly less than this — *"PARTIAL, and the part is chosen rather than
 * incidental"* — so the precedent existed in the same file and this entry did not follow it. #34 records
 * that two criteria overstate their coverage; that is what this catches.
 *
 * ## Why the note is a fair thing to test against
 *
 * These notes are not prose decoration. They are the place this project records what a claim does NOT
 * cover, and `documented-criteria.test.ts` already treats them as load-bearing. A note that says something
 * is not covered is the author stating a limit; a status of `assessed` is the file stating there is none.
 * Those cannot both be true, and nothing compared them.
 *
 * Measured when written: **55 entries, exactly one contradiction** — so this is a real guard on a clean
 * population rather than a rule that would need a table of exemptions to hold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CRITERION_COVERAGE } from "./criterion-coverage.js";

/** The author saying, in the note, that some part of the criterion is out of reach. */
const SAYS_SOMETHING_IS_NOT_COVERED = /\bnot covered\b/i;

test("no criterion claims `assessed` while its own note says part of it is not covered", () => {
  const entries = Object.entries(CRITERION_COVERAGE);
  // A discovery that finds nothing passes having examined nothing. There were 55 when this was written.
  assert.ok(entries.length >= 40,
    `only ${entries.length} coverage entries; the import has broken, not the file`);

  const contradictions = entries
    .filter(([, entry]) => entry.status === "assessed"
      && typeof entry.note === "string" && SAYS_SOMETHING_IS_NOT_COVERED.test(entry.note))
    .map(([id]) => id);

  assert.deepEqual(contradictions, [],
    "these are recorded `assessed` while their own note names something the criterion does not cover. "
    + "`status` is what the report prints and what the public coverage count sums; the note is where the "
    + "limit is written. Use `partial` — 2.4.2 and 2.4.1 already do, for less.");
});

test("4.1.3 specifically is partial, and names the evidence that would close it", () => {
  // Pinned by name because it is the case the row was filed about.
  //
  // The first version of this asserted `needs === undefined`, on the reasoning that 4.1.3's gap is a
  // CORPUS gap rather than a missing source. `criterion-coverage.test.ts` refused it and was right:
  // `needs` names what would CLOSE the gap, not what cannot be obtained — "without this the map degrades
  // into the same undifferentiated `untested` bucket it exists to replace". Recorded because the wrong
  // reading is the natural one from the field's name.
  const entry = CRITERION_COVERAGE["4.1.3"];
  assert.equal(entry.status, "partial");
  assert.deepEqual(entry.needs, ["screen-reader"],
    "the uncovered categories are waiting state and progress, and this entry's own note calls them "
    + "reachable because a live region is as audible as anything else — that is NVDA's output");
  assert.match(entry.note ?? "", /FOUR categories/,
    "the note must keep saying which part is uncovered; the status alone does not tell a reader that");
});
