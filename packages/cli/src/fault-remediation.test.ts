/**
 * Every fault code the worker can report must have remediation text here, or a stranger meeting
 * `(fault: screen-reader-mute)` learns nothing from it — see this file's own header for the incident.
 *
 * DISCOVERS the fault codes from `packages/nvda-worker/src/capture-faults.mjs`'s `FAULT`, by RELATIVE
 * PATH to its source, never a package import — `@a11y-witness/nvda-worker` is deliberately not a
 * dependency of this package (see `fault-remediation.ts`'s header), and even if it were, importing the
 * PUBLISHED package would resolve to a `dist` that could be stale relative to this worktree's source
 * (docs/backlog.md, issue #28's exact shape) — a relative import into `../../nvda-worker/src/` reads the
 * same source tree this checkout is testing, regardless of any package's build state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAULT } from "../../nvda-worker/src/capture-faults.mjs";
import { FAULT_REMEDIATION, remediationFor, formatFaultMessage, type FaultRemediation } from "./fault-remediation.js";

const KNOWN_FAULTS: string[] = Object.values(FAULT);

test("the discovery finds a non-trivial population -- vacuity guard for the walk itself", () => {
  assert.ok(KNOWN_FAULTS.length >= 4,
    `only found ${KNOWN_FAULTS.length} fault code(s) in capture-faults.mjs -- the import is broken, not `
    + "the fault list shrinking");
});

test("every declared fault code has a remediation entry with all three fields, non-empty", () => {
  const missing: string[] = [];
  for (const fault of KNOWN_FAULTS) {
    const remediation = FAULT_REMEDIATION[fault];
    if (!remediation) { missing.push(`${fault}: no entry at all`); continue; }
    for (const field of ["what", "tryThis", "whereToLook"] as const) {
      if (!remediation[field] || remediation[field].trim().length === 0) {
        missing.push(`${fault}: "${field}" is missing or empty`);
      }
    }
  }
  assert.deepEqual(missing, [],
    `a fault code shipped with no remediation, or an incomplete one -- a caller meeting it learns nothing:\n`
    + missing.map((m) => `  ${m}`).join("\n"));
});

test("no stale entry -- every remediation key is still a real, current fault code", () => {
  // The mirror of the test above: a code REMOVED from capture-faults.mjs but still listed here is a
  // remediation for a fault that can no longer occur, which just clutters the map -- and, more to the
  // point, a renamed fault would otherwise look "handled" here while its NEW name silently falls through
  // to the "no remediation recorded" fallback.
  const stale = Object.keys(FAULT_REMEDIATION).filter((key) => !KNOWN_FAULTS.includes(key));
  assert.deepEqual(stale, [], `these remediation entries name a fault code that no longer exists: ${stale.join(", ")}`);
});

test("formatFaultMessage includes all three remediation parts for a known fault", () => {
  const message = formatFaultMessage("wrong-page", "the browser is showing X, not Y");
  assert.match(message, /the browser is showing X, not Y/, "the raw worker message must survive");
  assert.match(message, /\(fault: wrong-page\)/, "the fault code itself must still be printed");
  const remediation = remediationFor("wrong-page")!;
  assert.match(message, new RegExp(remediation.what.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(message, new RegExp(remediation.tryThis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(message, new RegExp(remediation.whereToLook.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("an UNKNOWN fault code says so explicitly, rather than silently omitting remediation", () => {
  const message = formatFaultMessage("some-future-fault-nobody-taught-this-file-yet", "it broke");
  assert.match(message, /it broke/);
  assert.match(message, /\(fault: some-future-fault-nobody-taught-this-file-yet\)/);
  assert.match(message, /no remediation is recorded/i);
});

test("MUTATION: a fault code with no remediation entry is caught by name", () => {
  const withGap = { ...FAULT_REMEDIATION };
  delete withGap["wrong-page"];
  const missing = KNOWN_FAULTS.filter((f) => !withGap[f]);
  assert.deepEqual(missing, ["wrong-page"], "removing one entry must be caught, by exactly that name");
});

test("MUTATION: a remediation entry missing one field is caught by name, not just by the fault code", () => {
  const withGap: Record<string, FaultRemediation> =
    { ...FAULT_REMEDIATION, "wrong-page": { ...FAULT_REMEDIATION["wrong-page"], tryThis: "" } };
  const problems: string[] = [];
  for (const fault of KNOWN_FAULTS) {
    for (const field of ["what", "tryThis", "whereToLook"] as const) {
      if (!withGap[fault]?.[field]?.trim()) problems.push(`${fault}: "${field}"`);
    }
  }
  assert.deepEqual(problems, ['wrong-page: "tryThis"']);
});
