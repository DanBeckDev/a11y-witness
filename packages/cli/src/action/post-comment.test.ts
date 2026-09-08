/**
 * #493: "Could not post the PR comment. The job summary still has the report" printed on all three of the
 * V1 rehearsal's runs while NO report existed -- the build had died before anything was produced. These
 * tests pin the message against a REAL file on disk, never against a fixture of the message itself
 * (`changeset-provenance.test.ts`'s own failure mode: it asserts how a row RENDERS, never that it describes
 * what ships) -- `reportSummaryExists` is exercised against a real temp path that either does or does not
 * exist, and `commentFailureMessage` is checked against that real result, not a hand-typed boolean standing
 * in for it.
 */
import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { reportSummaryExists, commentFailureMessage } from "./post-comment.js";

test("reportSummaryExists: true for a file that is genuinely on disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "post-comment-test-"));
  const summary = join(dir, "a11ign-summary.md");
  writeFileSync(summary, "## a11ign report\n\nNo findings.\n");
  try {
    assert.equal(reportSummaryExists(summary), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reportSummaryExists: false for a path nothing ever wrote to -- the #493 shape, exactly", () => {
  const dir = mkdtempSync(join(tmpdir(), "post-comment-test-"));
  // Deliberately never written -- this is what $RUNNER_TEMP/a11ign-summary.md looks like on the run.ts
  // early-exit paths (a missing/unreadable result, or a result with no verdict): the directory exists
  // (RUNNER_TEMP always does), the file inside it does not.
  const neverWritten = join(dir, "a11ign-summary.md");
  try {
    assert.equal(reportSummaryExists(neverWritten), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("commentFailureMessage: MUTATION TARGET -- the two states print DIFFERENT sentences, never the same one", () => {
  const whenExists = commentFailureMessage(true);
  const whenAbsent = commentFailureMessage(false);
  assert.notEqual(whenExists, whenAbsent);
});

test("commentFailureMessage: a report that exists keeps the original, accurate sentence", () => {
  assert.equal(commentFailureMessage(true),
    "::warning::Could not post the PR comment. The job summary still has the report.");
});

test("commentFailureMessage: #493's own defect -- when no report exists, the message must not claim the "
  + "job summary has one", () => {
  const message = commentFailureMessage(false);
  assert.doesNotMatch(message, /job summary still has the report/,
    "this is the exact false claim #493 was filed over -- it must never appear when reportExists is false");
});

test("commentFailureMessage: the absent-report message names the real cause, not silence", () => {
  const message = commentFailureMessage(false);
  assert.match(message, /run failed before a result existed/);
});

// --- End-to-end through the real file check, not a hand-typed boolean ---

test("#493 ACCEPTANCE: a run where the report EXISTS but the comment fails gets the CURRENT message, "
  + "unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "post-comment-test-"));
  const summary = join(dir, "a11ign-summary.md");
  writeFileSync(summary, "## a11ign report\n\n1 finding.\n");
  try {
    const message = commentFailureMessage(reportSummaryExists(summary));
    assert.equal(message, "::warning::Could not post the PR comment. The job summary still has the report.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("#493 ACCEPTANCE: a run where the build died and NO report exists gets a DIFFERENT message naming "
  + "the real failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "post-comment-test-"));
  const summary = join(dir, "a11ign-summary.md"); // never written
  try {
    const message = commentFailureMessage(reportSummaryExists(summary));
    assert.doesNotMatch(message, /job summary still has the report/);
    assert.match(message, /run failed before a result existed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
