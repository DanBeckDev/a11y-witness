import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `routeChange.navigated` is `true` on every successful activation `probeRouteChange` records --
 * `capture-probes.mjs` sets it regardless of whether the view actually moved -- so a rule (or the Python
 * featurizer) reading it as corroboration of navigation learns nothing: it agrees with the evidence it is
 * supposedly corroborating (#250). The real signal is `titleBefore`/`titleAfter`/`headingBefore`/
 * `headingAfter`, which `addStaleRouteTitle` and `addInertSkipLink` already read; `route.control === null`
 * is the correct applicability gate ("was anything probed at all"), and it is what both rules use now.
 *
 * This scans SOURCE TEXT rather than asserting behaviour, because the hazard is a FUTURE line, not a
 * present one -- the same shape `structure-declarations.test.ts` uses for exactly the same reason: `tsc`
 * cannot see "a new call site read a field it should not", and a behavioural test can only fail once
 * something has already gone looking for the tautology and found it. Comments are stripped first so the
 * two doc comments explaining this by name (in `rules.ts` itself) do not trip their own guard.
 */
const ROOT = join(import.meta.dirname, "../../..");

// Each guarded file, with a SENTINEL known to exist in it right now. A scan whose target moved, was
// renamed, or resolves empty must FAIL, not pass having examined nothing -- the exact shape CLAUDE.md
// records against `SIGNAL_TYPES`'s source scrape: "the test asserted over an empty set -- and passed."
const GUARDED_FILES: { path: string; sentinel: string }[] = [
  { path: "packages/judge/src/rules.ts", sentinel: "function addStaleRouteTitle" },
  { path: "packages/scorer/python/screenreader_features.py", sentinel: "def all_evidence" },
];

function withoutComments(path: string, text: string): string {
  if (path.endsWith(".py")) {
    return text
      .replace(/"""[\s\S]*?"""/g, "")
      .replace(/'''[\s\S]*?'''/g, "")
      .replace(/#.*$/gm, "");
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("no rule and no featurizer reads routeChange.navigated -- it is true on every success path", () => {
  for (const { path, sentinel } of GUARDED_FILES) {
    const raw = readFileSync(join(ROOT, path), "utf8");
    assert.ok(raw.length > 0, `${path} is empty -- the scan below would pass having examined nothing`);
    assert.match(raw, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${path} no longer contains "${sentinel}" -- this file moved or was renamed, and the scan below `
        + "would otherwise pass silently against the wrong (or an empty) target");
    const code = withoutComments(path, raw);
    assert.doesNotMatch(code, /\.navigated\b/,
      `${path} reads \`.navigated\` outside a comment -- routeChange.navigated is a tautology on every `
        + "successful activation, not evidence that the view moved. Read titleBefore/titleAfter/"
        + "headingBefore/headingAfter instead, or route.control === null for \"was this even probed\".");
  }
});

test("the guard does not forbid the fields that carry real evidence", () => {
  // `titleBefore`/`titleAfter`/`headingBefore`/`headingAfter` are read via destructuring (bare
  // identifiers, no leading dot); `control` is read as `route.control`. Either shape must survive.
  const code = withoutComments("packages/judge/src/rules.ts", readFileSync(join(ROOT, "packages/judge/src/rules.ts"), "utf8"));
  for (const field of ["titleBefore", "titleAfter", "headingBefore", "headingAfter"]) {
    assert.match(code, new RegExp(`\\b${field}\\b`), `rules.ts should still read ${field}`);
  }
  assert.match(code, /route\.control\b/, "rules.ts should still read route.control");
});
