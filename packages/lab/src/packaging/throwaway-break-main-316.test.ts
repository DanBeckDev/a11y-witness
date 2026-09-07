/**
 * DELIBERATE THROWAWAY -- #316's own live acceptance test.
 *
 * This file exists for a few minutes, on purpose. It is force-merged onto `main` (bypassing branch
 * protection, an explicit admin action) specifically to fail trunk-guard.yml's push-triggered gate, so
 * pipeline unit 3's automatic revert can be proven against a REAL commit on the REAL `main` rather than
 * asserted from a workflow log. `trunk-revert.mjs` should open a PR reverting the commit that adds this
 * file, and that revert PR's own `mergedAt` (read from the API, not a green workflow run) is the acceptance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("THROWAWAY: this always fails, on purpose, to trigger trunk-guard's revert -- #316", () => {
  assert.equal(1, 2, "if you are reading this in a CI log, it is doing exactly what it is meant to");
});
