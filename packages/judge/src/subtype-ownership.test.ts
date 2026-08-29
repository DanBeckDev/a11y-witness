/**
 * WHO DECIDES EACH SUBTYPE is declared once, in `packages/lab/rule-ownership.json`, and prose must not
 * restate it.
 *
 * `criterion-coverage.ts` used to enumerate "the nine subtypes the head decides alone". By 2026-08-29 that
 * sentence listed TEN, named several that had since moved to the rules — including
 * `4.1.2:state-change-silent`, which ADR 0021 moved deliberately and which the file went on citing as
 * head-owned — and omitted that two of the real three are decided by NOBODY.
 *
 * That is the fact-stated-twice defect in the file whose whole purpose is honesty about what this tool
 * covers. The prose no longer enumerates; this pins the counts so the shape it does describe cannot drift
 * silently either.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const OWNERSHIP = resolve(import.meta.dirname, "../../lab/rule-ownership.json");

function ownership(): Record<string, { decidedBy?: string }> {
  const parsed = JSON.parse(readFileSync(OWNERSHIP, "utf8")) as
    { subtypes?: Record<string, { decidedBy?: string }> };
  return parsed.subtypes ?? (parsed as unknown as Record<string, { decidedBy?: string }>);
}

test("every subtype declares an owner, and only from the vocabulary that exists", () => {
  // A typo'd `decidedBy` would silently make a subtype non-rules-owned, which is the direction that
  // matters: the rules are the only layer allowed to ASSERT.
  const KNOWN = new Set(["rules", "overlap", "unavailable"]);
  const bad = Object.entries(ownership())
    .filter(([, v]) => typeof v === "object" && v !== null)
    .filter(([, v]) => !KNOWN.has(String(v.decidedBy)))
    .map(([k, v]) => `${k}=${v.decidedBy}`);
  assert.deepEqual(bad, [], `unknown decidedBy value; the vocabulary is ${[...KNOWN].join(", ")}`);
});

test("THE PROSE NO LONGER ENUMERATES, because the enumeration went stale", () => {
  // Delete a copy is this repo's first remedy for a fact stated twice, ahead of deriving or pinning.
  const source = readFileSync(resolve(import.meta.dirname, "criterion-coverage.ts"), "utf8");
  const stale = ["1.1.1:generic-alt", "1.3.1:fake-heading", "3.3.1:validation-error-silent",
    "4.1.3:form-activation-silent"];
  const found = stale.filter((subtype) => source.includes(subtype));
  assert.deepEqual(found, [],
    "criterion-coverage.ts must not list subtype owners — rule-ownership.json declares them, and the "
    + "last copy of that list named subtypes which had moved to the rules");
});

test("the counts the prose DOES state are true", () => {
  const entries = Object.values(ownership()).filter((v) => typeof v === "object" && v !== null);
  const byOwner = (owner: string) => entries.filter((v) => v.decidedBy === owner).length;
  assert.ok(byOwner("rules") > 0, "the rules must own something, or nothing can be asserted at all");
  // Not pinned to an exact number: the point is that `unavailable` EXISTS and is visible, because
  // "nobody decides this" is the claim the old prose obscured by calling it head-owned.
  assert.ok(byOwner("unavailable") > 0,
    "at least one subtype is decided by nobody, and saying so is the honesty this file is for");
  assert.equal(entries.length, byOwner("rules") + byOwner("overlap") + byOwner("unavailable"),
    "every subtype is accounted for by exactly one owner");
});
