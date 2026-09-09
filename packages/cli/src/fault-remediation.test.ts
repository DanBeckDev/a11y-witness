/**
 * Every fault code the worker can report must have remediation text here, or a stranger meeting
 * `(fault: screen-reader-mute)` learns nothing from it — see this file's own header for the incident.
 *
 * DISCOVERS the fault codes from `packages/nvda-worker/src/capture-faults.mjs`'s `FAULT`, by RELATIVE
 * PATH to its source, never a package import — `@a11ign/nvda-worker` is deliberately not a
 * dependency of this package (see `fault-remediation.ts`'s header), and even if it were, importing the
 * PUBLISHED package would resolve to a `dist` that could be stale relative to this worktree's source
 * (docs/backlog.md, issue #28's exact shape) — a relative import into `../../nvda-worker/src/` reads the
 * same source tree this checkout is testing, regardless of any package's build state.
 *
 * PLUS the one JUDGE-layer fault code (#81), read the same way but from Python source text rather than
 * imported (this package cannot `import` Python) — `score.py`'s `FAULT = "..."` class attribute, pulled
 * out with a regex rather than hand-copied, so a renamed fault code fails this discovery instead of
 * silently leaving a stale string here.
 *
 * PLUS the two `CaptureDoubt` values (#398) — CLIENT-SIDE judgements about an otherwise-successful
 * capture, not a worker-reported fault, but they share this table's WHAT/TRY/WHERE shape (see
 * `fault-remediation.ts`'s header for why). `packages/cli` already depends on `@a11ign/evidence` (`cli.ts`
 * imports `captureDoubt` from it directly), so this COULD import the type — but `CaptureDoubt` is a
 * TypeScript union, gone at runtime, and there is no runtime list to import. Scraped from source text
 * instead, the identical technique `judgeLayerFaultCodes` already uses one line below for the same reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FAULT } from "../../nvda-worker/src/capture-faults.mjs";
import {
  FAULT_REMEDIATION, remediationFor, formatFaultMessage, formatDoubtMessage, formatEarlyContainmentNotice,
  type FaultRemediation,
} from "./fault-remediation.js";

const SCORE_PY_PATH = fileURLToPath(new URL("../../scorer/python/score.py", import.meta.url));
const VERIFY_TS_PATH = fileURLToPath(new URL("../../evidence/src/verify.ts", import.meta.url));

function judgeLayerFaultCodes(): string[] {
  const source = readFileSync(SCORE_PY_PATH, "utf8");
  const match = source.match(/FAULT\s*=\s*"([^"]+)"/);
  return match ? [match[1]] : [];
}

/** `export type CaptureDoubt = "wrong-content" | "contained";` -- the union members, by regex, per this
 *  file's own rule above: no runtime value survives compilation for `Object.values` to walk. */
function captureDoubtCodes(): string[] {
  const source = readFileSync(VERIFY_TS_PATH, "utf8");
  const match = source.match(/type CaptureDoubt = ([^;]+);/);
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

const KNOWN_FAULTS: string[] = [...Object.values(FAULT), ...judgeLayerFaultCodes(), ...captureDoubtCodes()];

test("the discovery finds a non-trivial population -- vacuity guard for the walk itself", () => {
  assert.ok(KNOWN_FAULTS.length >= 5,
    `only found ${KNOWN_FAULTS.length} fault code(s) across capture-faults.mjs and score.py -- a `
    + "discovery is broken, not the fault list shrinking");
});

test("the CaptureDoubt scrape finds both known values -- vacuity guard for #398's addition", () => {
  const doubts = captureDoubtCodes();
  assert.deepEqual([...doubts].sort(), ["contained", "wrong-content"],
    `found ${JSON.stringify(doubts)} -- either verify.ts's CaptureDoubt union changed shape or the regex `
    + "broke; both are worth knowing about before trusting KNOWN_FAULTS");
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

test("hard-timeout gets the full WHAT/TRY/WHERE treatment, like any other known fault", () => {
  const message = formatFaultMessage("hard-timeout", "capture exceeded the hard timeout of 520000 ms "
    + "and was abandoned");
  assert.match(message, /hard timeout/i);
  assert.match(message, /\(fault: hard-timeout\)/);
  const remediation = remediationFor("hard-timeout")!;
  assert.match(message, new RegExp(remediation.what.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("#398: a CaptureDoubt gets the full WHAT/TRY/WHERE treatment, worded as a doubt not a failure", () => {
  const message = formatDoubtMessage("contained", "the screen reader reached almost none of this page");
  assert.match(message, /the screen reader reached almost none of this page/, "the detail must survive");
  assert.match(message, /\(contained\)/, "the doubt code itself must still be printed");
  assert.doesNotMatch(message, /worker's capture failed/i,
    "a doubt is about a SUCCESSFUL capture's content -- 'the worker's capture failed' would misdescribe "
    + "the 200 OK response this tool is doubting");
  const remediation = remediationFor("contained")!;
  assert.match(message, new RegExp(remediation.what.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(message, new RegExp(remediation.tryThis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(message, new RegExp(remediation.whereToLook.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("#426: the early notice says WHEN it looked and that this is not the final result", () => {
  const message = formatEarlyContainmentNotice(8234);
  assert.match(message, /8\.2s/, "the observation time must survive, so 'a capture is not an instant' "
    + "does not become an unstated assumption");
  assert.match(message, /not the final result/i, "must not read like the same VERDICT formatDoubtMessage prints");
  assert.doesNotMatch(message, /worker's capture failed/i);
  // Gets the SAME remediation table entry as the finished "contained" doubt -- one WHAT/TRY/WHERE, not a
  // second copy that could drift from it.
  const remediation = remediationFor("contained")!;
  assert.match(message, new RegExp(remediation.tryThis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("#336: the progress argument reports how far a PARTIAL capture got, when the worker said", () => {
  const withProgress = formatFaultMessage("hard-timeout", "capture exceeded the hard timeout",
    { reachedPhase: "readingForm", markCount: 7 });
  assert.match(withProgress, /Got as far as: "readingForm"/);
  assert.match(withProgress, /7 progress mark\(s\) recorded before stopping/);

  const withoutProgress = formatFaultMessage("hard-timeout", "capture exceeded the hard timeout");
  assert.doesNotMatch(withoutProgress, /Got as far as/,
    "no progress was given, so none may be invented -- 'we could not read your page at all' and 'we "
    + "ran out of time partway through' are different findings");

  const phaseOnly = formatFaultMessage("hard-timeout", "capture exceeded the hard timeout",
    { reachedPhase: "navigated" });
  assert.match(phaseOnly, /Got as far as: "navigated"/);
  assert.doesNotMatch(phaseOnly, /progress mark\(s\)/,
    "a mark COUNT that was never supplied must not be fabricated as a number");
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
