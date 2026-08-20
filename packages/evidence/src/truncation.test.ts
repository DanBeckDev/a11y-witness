/**
 * `captureWasTruncated` decides whether a capture's channels were examined to the end.
 *
 * It exists because truncation and absence are the same bytes, and on real pages truncation is the common
 * case. These tests assert against the SHAPES the capture actually records -- taken from real diagnostics,
 * not invented -- because a guard written against a shape nobody verified is the defect it is meant to stop.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { captureWasTruncated } from "./verify.js";

const sweep = (type: string, prevStop: string, nextStop: string, found = 0) =>
  ({ event: "sweep", type, found, prevStop, nextStop });

test("a fully exhausted capture is not truncated", () => {
  assert.deepEqual(captureWasTruncated([
    sweep("heading", "exhausted", "exhausted", 11),
    sweep("link", "exhausted", "exhausted", 25),
    { event: "readThrough", count: 89, stopReason: "repeatBottom" },
  ]), []);
});

test("the real failure: a list sweep that never ran is reported, not read as zero lists", () => {
  // Verbatim from www-w3-org-WAI-demos-bad-after-news-html.json, which reports `lists: 0`.
  const found = captureWasTruncated([sweep("list", "deadline", "deadline", 0)]);
  assert.deepEqual(found, [
    { channel: "list", reason: "deadline", kind: "starved" },
    { channel: "list", reason: "deadline", kind: "starved" },
  ]);
});

test("one direction exhausted and the other starved is still truncated", () => {
  // A partial count is the dangerous case: it looks like evidence. Measured on the same capture, whose
  // link sweep exhausted backwards and hit the deadline forwards after 25 of ~50 links.
  const found = captureWasTruncated([sweep("link", "exhausted", "deadline", 25)]);
  assert.deepEqual(found, [{ channel: "link", reason: "deadline", kind: "starved" }]);
});

test("`cap` is capped, not starved — they are different bugs", () => {
  // 250 steps yielding 41 unique links is the cursor re-walking, not a large document. Collapsing the two
  // would send someone to raise a budget that was never the constraint.
  assert.deepEqual(captureWasTruncated([sweep("link", "cap", "exhausted")]),
    [{ channel: "link", reason: "cap", kind: "capped" }]);
});

test("`repeat` and `silent` are INFERENCES, never completion", () => {
  // Both have cost real evidence: stopping on a repeated phrase gave "graphics 5 of 66" on a page with four
  // identical avatar alts; stopping on a silent step gave "headings 3 of 10, no error anywhere". NVDA
  // announces the end of a page, and that is `exhausted`.
  assert.deepEqual(captureWasTruncated([sweep("graphic", "repeat", "exhausted")]),
    [{ channel: "graphic", reason: "repeat", kind: "inferred" }]);
  assert.deepEqual(captureWasTruncated([sweep("heading", "silent", "exhausted")]),
    [{ channel: "heading", reason: "silent", kind: "inferred" }]);
});

test("a read-through that hit the deadline or the line cap is incomplete", () => {
  assert.deepEqual(captureWasTruncated([{ event: "readThrough", stopReason: "deadline" }]),
    [{ channel: "read-through", reason: "deadline", kind: "starved" }]);
  assert.deepEqual(captureWasTruncated([{ event: "readThrough", stopReason: "maxSteps" }]),
    [{ channel: "read-through", reason: "maxSteps", kind: "capped" }]);
  assert.deepEqual(captureWasTruncated([{ event: "readThrough", stopReason: "wrap" }]), []);
});

test("an unknown stop reason is treated as a FAULT, never as success", () => {
  // The safe direction: a reason nobody has seen must not silently pass as complete, because the whole
  // point is that a missing channel is indistinguishable from an empty one.
  assert.deepEqual(captureWasTruncated([sweep("list", "somethingNew", "exhausted")]),
    [{ channel: "list", reason: "somethingNew", kind: "faulted" }]);
});

test("absent or malformed diagnostics do not throw", () => {
  // An older capture may carry none. "We cannot tell" must not crash an export.
  assert.deepEqual(captureWasTruncated(undefined), []);
  assert.deepEqual(captureWasTruncated([null, 3, "x", {}]), []);
});
