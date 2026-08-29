/**
 * THE SCAN'S SCOPE MUST NOT NARROW WHEN AXE WIDENS.
 *
 * `WCAG_AA_TAGS` is handed to `AxeBuilder.withTags()`, so it decides which rules run. A tag added by a
 * future axe version would silently shrink the scan — and a scan that quietly checks less still reports
 * "0 violations", which is this project's cardinal failure.
 *
 * Checked against the INSTALLED axe-core rather than a hand-written expectation, so the two cannot drift.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { WCAG_AA_TAGS } from "./axe.js";

const require = createRequire(import.meta.url);

/** Every conformance-level tag the installed axe-core actually uses. */
function axeLevelTags(): string[] {
  const axe = require("axe-core") as { getRules: () => { tags?: string[] }[] };
  const tags = new Set<string>();
  for (const rule of axe.getRules()) {
    for (const tag of rule.tags ?? []) if (/^wcag2\d?a+$/.test(tag)) tags.add(tag);
  }
  return [...tags].sort();
}

test("every A/AA tag axe offers is in the scan's scope", () => {
  const offered = axeLevelTags();
  assert.ok(offered.length >= 5, `only found ${offered.length} level tags; the walk is broken, not axe`);
  const missing = offered.filter((tag) => !tag.endsWith("aaa") && !WCAG_AA_TAGS.includes(tag));
  assert.deepEqual(missing, [],
    "axe offers an A/AA tag this scan does not request, so it is checking less than it claims");
});

test("and AAA stays OUT of scope, because the legal baseline is AA", () => {
  // Widening to AAA would report failures against a level nobody is held to, which is a different kind of
  // wrong answer and just as unhelpful.
  assert.deepEqual(WCAG_AA_TAGS.filter((t) => t.endsWith("aaa")), []);
  assert.ok(axeLevelTags().includes("wcag2aaa"), "axe does offer AAA; excluding it must be a CHOICE");
});
