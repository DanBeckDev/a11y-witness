/**
 * #1391: THE STATE CHANGES A SCREEN READER ANNOUNCED CORRECTLY -- one export, the same gates as the rule.
 *
 * Rehearsal 3's reader found the one piece of evidence that shows what this tool is for, a disclosure announcing
 * its new state, "collected, stored, and then not shown to me". The report now shows such a change as evidence
 * observed. What counts is decided HERE and only here: `announcedStateChanges` applies the SAME gates as
 * `4.1.2:state-change-silent` -- a role whose activation is Enter, one control named on both sides
 * (`sameControlAnnounced`, @a11ign/evidence), and an expandable state on both sides -- through one pairing helper
 * the rule also calls. A pass is that pair with DIFFERENT states; the rule's failure is the same pair with the SAME
 * state. Two copies of those gates would drift, and ADR 0021 records what drifting state vocabulary cost.
 *
 * The fixtures are REAL captures, read from the lab eval corpus as committed (`tutorials/disclosure-good.json`,
 * `menus-good.json`, `disclosure-bad.json`), plus rehearsal 3's run result. One shape has no committed capture --
 * a NAMED combo box whose state changes -- and is synthetic, said where it is built.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { announcedStateChanges, ruleFindings } from "./rules.js";

type Change = { control: string; after: string };
const ROOT = new URL("../../../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(path, ROOT)), "utf8"));
const stateChangesOf = (path: string): Change[] => read(path).interaction?.stateChanges ?? [];

const DISCLOSURE_GOOD = "packages/lab/src/eval/fixtures/tutorials/disclosure-good.json";
const MENUS_GOOD = "packages/lab/src/eval/fixtures/tutorials/menus-good.json";
const DISCLOSURE_BAD = "packages/lab/src/eval/fixtures/tutorials/disclosure-bad.json";
const REHEARSAL_3 = "packages/cli/src/fixtures/rehearsal3-34774183433-a11ign-result.json";

/** The rule's `4.1.2:state-change-silent` findings, by the issue text `addSilentStateChanges` writes. */
const silentStateChanges = (changes: Change[]) => ruleFindings({ transcript: [], interaction: { stateChanges: changes } })
  .filter((finding) => /same state after activation/.test(finding.issue));

test("#1391 ACCEPTANCE: a real disclosure and a real menu button, each announced collapsed then expanded, are listed", () => {
  for (const path of [DISCLOSURE_GOOD, MENUS_GOOD]) {
    const changes = stateChangesOf(path);
    assert.equal(changes.length, 1, `${path}: the fixture as committed holds one pair`);
    assert.deepEqual(announcedStateChanges(changes), [{ ...changes[0], from: "collapsed", to: "expanded" }], path);
  }
});

test("#1391 ABSENCE: the rule's own failure is NOT listed, and neither is a capture with no state changes", () => {
  const bad = stateChangesOf(DISCLOSURE_BAD);
  assert.equal(bad.length, 1, "the fixture as committed holds one pair");
  assert.deepEqual(announcedStateChanges(bad), [], "a control that says collapsed after activation changed nothing");
  assert.deepEqual(announcedStateChanges([]), []);
});

test("#1391 ROLE GATE: a NAMED combo box announced collapsed then expanded is not listed, as the rule would not read it", () => {
  // SYNTHETIC: no committed capture holds a named combo box whose state changes. Enter is not a combo box's
  // activation, so the rule never treats one as a disclosure; listing it here would show a pass on a gate the rule
  // refuses. The names match, so this isolates the role gate from the identity gate.
  const comboBox = [{ control: "Search the site, combo box, collapsed", after: "Search the site, combo box, focused, expanded" }];
  assert.deepEqual(announcedStateChanges(comboBox), []);
  // POSITIVE CONTROL for the gate: the same pair as a BUTTON is listed, so the empty result above is the role.
  const button = [{ control: "Search the site, button, collapsed", after: "Search the site, button, focused, expanded" }];
  assert.equal(announcedStateChanges(button).length, 1);
});

test("#1391: rehearsal 3's taskButton pair is not a state change -- it is formChanges, and its after names no control", () => {
  const result = read(REHEARSAL_3);
  assert.deepEqual(result.interaction.stateChanges, [], "a stated limit: stateChanges is empty in the rehearsal results");
  const taskButton = result.interaction.formChanges.filter((change: { kind: string }) => change.kind === "taskButton");
  assert.equal(taskButton.length, 1, "the account's pair, as committed");
  assert.deepEqual(announcedStateChanges(taskButton), [], "read as a state change it still names two different things");
});

test("#1391: the rule's 4.1.2:state-change-silent findings are UNCHANGED on every fixture above", () => {
  // Recorded from `ruleFindings` at fa171df3, before the gates were shared.
  assert.deepEqual(silentStateChanges(stateChangesOf(DISCLOSURE_GOOD)), []);
  assert.deepEqual(silentStateChanges(stateChangesOf(MENUS_GOOD)), []);
  const [finding, ...rest] = silentStateChanges(stateChangesOf(DISCLOSURE_BAD));
  assert.deepEqual(rest, []);
  assert.equal(finding?.mapping, "conformance");
  assert.equal(finding?.evidence, "How do I reset my password?, button, collapsed -> How do I reset my password?, button, focused, collapsed");
  assert.deepEqual(silentStateChanges([{ control: "Search the site, combo box, collapsed", after: "Search the site, combo box, focused, collapsed" }]), [],
    "and the role gate still spares a combo box on the failure path");
});
