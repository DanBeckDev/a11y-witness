/**
 * The declaration must be capable of REFUSING, or it is a skip with a nicer name.
 *
 * This exists because the thing it replaces — `A11Y_SKIP_VERIFY=1` — was routinely used and disabled every
 * other check in the pre-push hook as a side effect. Swapping one silent bypass for another would be no gain,
 * so the two failure modes that matter are pinned here: an OPEN migration must block release, and a verdict
 * function that cannot say no must not pass for one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migrationVerdict, MIGRATION_FILE } from "../../../scripts/check-schema-migration.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("no declaration means nothing is blocking release", () => {
  const verdict = migrationVerdict(null);
  assert.equal(verdict.ok, true);
});

test("an open migration BLOCKS, and names both schemas so the reader can act", () => {
  const verdict = migrationVerdict({
    pendingSchema: "screenreader-structured-v99",
    shippedSchema: "screenreader-structured-v98",
    openedAt: "2026-01-01",
    why: "a reason",
  });
  assert.equal(verdict.ok, false, "an open migration that does not block is decoration");
  assert.match(verdict.message, /screenreader-structured-v98 -> screenreader-structured-v99/,
    "the message must name both schemas, so the reader knows what must change");
  assert.match(verdict.message, /a reason/, "the declared reason must reach the person who is blocked");
});

test("the declaration in this tree, if present, is one the release gate can evaluate", () => {
  // Not "is it open" — that is a normal branch state. Whether it is WELL FORMED, because a malformed one
  // would throw inside the gate and a thrown gate reads as a broken tool rather than a refusal.
  const path = new URL("../models/schema-migration.json", import.meta.url);
  if (!existsSync(path)) return;
  const declaration = JSON.parse(readFileSync(path, "utf8"));
  for (const field of ["pendingSchema", "shippedSchema", "openedAt", "why"]) {
    assert.ok(String(declaration[field] ?? "").trim(), `${MIGRATION_FILE} is missing \`${field}\``);
  }
  assert.notEqual(declaration.pendingSchema, declaration.shippedSchema,
    "a migration from a version to itself is not a migration");
  assert.ok(repoRoot.length > 0);
});
