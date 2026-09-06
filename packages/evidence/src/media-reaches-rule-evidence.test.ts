import test from "node:test";
import assert from "node:assert/strict";
import { oracleCounts } from "./verify.js";

/**
 * `media` MUST REACH `ruleEvidence`, and this exists because it did not.
 *
 * `1.4.2:autoplay-uncontrollable` reads `input.media` — `autoplay` and `muted` are DOM attributes with no
 * accessibility-tree equivalent, so it is the one rule that must read the DOM. The exporter's
 * `FORBIDDEN_INPUT_KEYS` excludes `dom` from the model's `input`, correctly, and `ruleEvidence` is the
 * sibling channel built exactly so a rule may use evidence the model never sees.
 *
 * It carried the census and not this. Measured on the first corpus containing the cases:
 *
 *     RULES: 1.4.2:autoplay-uncontrollable is rule-decided on 7 record(s) and caught only 0
 *
 * Seven records whose whole purpose is that subtype, and the rule could not see one of them. The same
 * shape as the 1.3.1 census defect, which is recorded at length in CLAUDE.md: the product path built the
 * field itself and worked, while the gate scored a record that never had it. A gate that does not exercise
 * what ships is not a gate.
 */
const captureWith = (media: unknown) => ({ transcript: [], structure: {}, interaction: {}, media }) as never;

test("a declared media element survives into ruleEvidence", () => {
  const el = { tag: "audio", autoplay: true, muted: false, controls: false, loop: true };
  const counts = oracleCounts(captureWith([el]));
  assert.deepEqual(counts.media, [el],
    "the 1.4.2 rule reads input.media; if oracleCounts drops it the rule cannot fire in rules:gate");
});

test("ABSENT and EMPTY stay different — the rule's own distinction", () => {
  // The rule's comment: captures predating the probe have no `media`, and treating that as "no autoplaying
  // audio" would assert on a question nobody asked. So this passes the field THROUGH rather than
  // defaulting it, and the two states must remain distinguishable downstream.
  assert.deepEqual(oracleCounts(captureWith([])).media, [], "empty means the probe ran and found none");
  assert.equal(oracleCounts({ transcript: [], structure: {}, interaction: {} } as never).media, undefined,
    "absent means the probe never ran, and must not become an empty array");
});
