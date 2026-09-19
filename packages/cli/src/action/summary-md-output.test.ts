// #1369 / PR #1748: reviewer-2's mutation at `6c94c761` changed action.yml's exported `summary-md`
// path away from the file the Report step actually writes (e.g. to `a11ign-missing.md`) and every
// existing Action/report test stayed green -- nothing read `steps.report.outputs.summary-md` and
// checked it names the file `--summary-out` writes. This is that missing positive control, plus the
// doc/table and workflow-example wiring the same kind of drift could hit unnoticed.
//
// Parsed by regex, not a YAML library, matching `documented-criteria.test.ts`'s own reasoning for
// `action.yml`: this guards the COPY committed here, not the runtime -- `action-smoke.yml` runs the
// real thing on every push.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ACTION = fileURLToPath(new URL("../../../../action.yml", import.meta.url));
const GUIDE = fileURLToPath(new URL("../../../../docs/github-action.md", import.meta.url));
const TRY_IT = fileURLToPath(new URL("../../../../docs/try-it.md", import.meta.url));

const action = () => readFileSync(ACTION, "utf8");

test("#1369: the summary-md output names the exact file --summary-out writes", () => {
  const text = action();
  const summaryOut = /--summary-out="([^"]+)"/.exec(text);
  assert.ok(summaryOut, "action.yml no longer passes --summary-out to run.ts -- this guard went blind");
  const echoed = /echo "summary-md=([^"]+)" >> "\$GITHUB_OUTPUT"/.exec(text);
  assert.ok(echoed, "action.yml no longer echoes a summary-md output -- this guard went blind");
  assert.equal(echoed![1], summaryOut![1],
    `the summary-md output claims "${echoed![1]}" but --summary-out actually writes "${summaryOut![1]}"`);
});

test("#1369: the summary-md output is wired to the Report step, the one that sets it", () => {
  const text = action();
  const declared = /summary-md:\n(?:.*\n)*?\s*value: (.+)/.exec(text);
  assert.ok(declared, "action.yml no longer declares a summary-md output -- this guard went blind");
  assert.match(declared![1], /steps\.report\.outputs\.summary-md/,
    `summary-md's declared value is "${declared![1]}", not steps.report.outputs.summary-md`);
});

test("#1369: docs/github-action.md's Outputs table documents summary-md", () => {
  const text = readFileSync(GUIDE, "utf8");
  const headingAt = text.indexOf("## Outputs");
  assert.ok(headingAt >= 0, "the guide's Outputs heading was reworded or moved -- update this test's anchor");
  const nextHeadingAt = text.indexOf("\n## ", headingAt + 1);
  const section = text.slice(headingAt, nextHeadingAt >= 0 ? nextHeadingAt : undefined);
  assert.match(section, /\|\s*`summary-md`\s*\|/, "the Outputs table has no summary-md row");
});

test("#1369: both example workflows upload summary-md alongside result-json in the a11ign-result artifact", () => {
  for (const [name, path] of [["docs/github-action.md", GUIDE], ["docs/try-it.md", TRY_IT]] as const) {
    const text = readFileSync(path, "utf8");
    const yamlBlock = /```yaml\n([\s\S]*?)\n```/.exec(text)?.[1];
    assert.ok(yamlBlock, `${name}'s example workflow block is missing or no longer fenced as yaml`);
    assert.match(yamlBlock!, /name:\s*a11ign-result/, `${name}'s example does not upload an a11ign-result artifact`);
    assert.match(yamlBlock!, /steps\.a11ign\.outputs\.result-json/, `${name}'s upload step dropped result-json`);
    assert.match(yamlBlock!, /steps\.a11ign\.outputs\.summary-md/, `${name}'s upload step does not include summary-md`);
  }
});
