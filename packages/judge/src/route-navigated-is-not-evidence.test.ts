import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * `routeChange.navigated` is `true` on every successful activation `probeRouteChange` records --
 * `capture-probes.mjs` sets it regardless of whether the view actually moved -- so a rule (or the corpus
 * predicates, or the Python featurizer) reading it as corroboration of navigation learns nothing: it
 * agrees with the evidence it is supposedly corroborating (#250). The real signal is
 * `titleBefore`/`titleAfter`/`headingBefore`/`headingAfter`; `route.control === null` is the correct
 * applicability gate ("was anything probed at all"). `addStaleRouteTitle`/`addInertSkipLink` in
 * `rules.ts` and `routeTitleIsStale`/`skipLinkIsInert` in `signal-predicates.mjs` all use it now --
 * TWO independent implementations of the same two rules, discovered a second time by a peer session
 * after this guard first shipped covering only `rules.ts`. That is exactly the shape this scan exists to
 * stop recurring: a hand-maintained file list is the thing that goes stale, not the pattern.
 *
 * This scans SOURCE TEXT rather than asserting behaviour, because the hazard is a FUTURE line, not a
 * present one -- the same shape `structure-declarations.test.ts` uses for exactly the same reason: `tsc`
 * cannot see "a new call site read a field it should not", and a behavioural test can only fail once
 * something has already gone looking for the tautology and found it. Comments are stripped first so the
 * doc comments explaining this by name do not trip their own guard.
 *
 * DISCOVERED, not hand-listed, for the TS/JS side: any non-test source file under `packages/` that
 * mentions `routeChange` at all is a candidate consumer and is scanned. `navigatedOnSubmit.navigated`
 * (verify.ts, local-judge.ts) is a different field on a different object and is correctly untouched --
 * confirmed those files never mention `routeChange`, so the discovery naturally excludes them without
 * needing to name them. The Python featurizer is the one EXPLICIT, sentinel-checked exception: it does
 * not read `routeChange` at all today (nothing to discover), but the issue's own region names it as
 * in-scope for when it does.
 */
const ROOT = join(import.meta.dirname, "../../..");
const PY_FEATURIZER = { path: "packages/scorer/python/screenreader_features.py", sentinel: "def all_evidence" };

/** Every non-test .ts/.mjs source file under packages/, as [path, text]. */
function jsSources(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
        walk(path);
        continue;
      }
      if (!/\.(ts|mjs)$/.test(entry.name) || /\.test\.(ts|mjs)$/.test(entry.name)) continue;
      out.push([path.slice(ROOT.length + 1), readFileSync(path, "utf8")]);
    }
  };
  walk(join(ROOT, "packages"));
  return out;
}

function withoutComments(path: string, text: string): string {
  if (path.endsWith(".py")) {
    return text
      .replace(/"""[\s\S]*?"""/g, "")
      .replace(/'''[\s\S]*?'''/g, "")
      .replace(/#.*$/gm, "");
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("every TS/JS source that mentions routeChange is free of `.navigated` reads", () => {
  const consumers = jsSources().filter(([, text]) => text.includes("routeChange"));
  // The sentinel this scan proves it did not examine nothing: a discovery that stopped finding files
  // (a rename, a moved package root) must fail loud, not pass having walked an empty set -- the exact
  // shape CLAUDE.md records against `SIGNAL_TYPES`'s source scrape, applied to a discovered population
  // rather than a hand-listed one.
  const paths = consumers.map(([path]) => path);
  for (const known of ["packages/judge/src/rules.ts", "packages/lab/src/training/signal-predicates.mjs"]) {
    assert.ok(paths.includes(known),
      `discovery did not find ${known}, which is known to mention routeChange today -- the walk root or `
        + "file-extension filter moved, and the scan below would otherwise pass having examined nothing");
  }
  for (const [path, text] of consumers) {
    assert.doesNotMatch(withoutComments(path, text), /\.navigated\b/,
      `${path} reads \`.navigated\` outside a comment -- routeChange.navigated is a tautology on every `
        + "successful activation, not evidence that the view moved. Read titleBefore/titleAfter/"
        + "headingBefore/headingAfter instead, or route.control === null for \"was this even probed\".");
  }
});

test("the Python featurizer stays free of it too, checked against a known-present sentinel", () => {
  const raw = readFileSync(join(ROOT, PY_FEATURIZER.path), "utf8");
  assert.ok(raw.length > 0, `${PY_FEATURIZER.path} is empty -- the scan below would pass having examined nothing`);
  assert.match(raw, new RegExp(PY_FEATURIZER.sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `${PY_FEATURIZER.path} no longer contains "${PY_FEATURIZER.sentinel}" -- this file moved or was `
      + "renamed, and the scan below would otherwise pass silently against the wrong (or an empty) target");
  assert.doesNotMatch(withoutComments(PY_FEATURIZER.path, raw), /\.navigated\b/,
    `${PY_FEATURIZER.path} reads \`.navigated\` -- routeChange.navigated is a tautology, see the TS test `
      + "above for the full explanation");
});

test("the guard does not forbid the fields that carry real evidence", () => {
  // `titleBefore`/`titleAfter`/`headingBefore`/`headingAfter` are read via destructuring (bare
  // identifiers, no leading dot) in rules.ts, and as `route.<field>` in signal-predicates.mjs. Both
  // shapes, and `route.control`, must survive -- a guard that forbids a field is one over-broad edit
  // away from silently deleting the evidence it protects.
  for (const path of ["packages/judge/src/rules.ts", "packages/lab/src/training/signal-predicates.mjs"]) {
    const code = withoutComments(path, readFileSync(join(ROOT, path), "utf8"));
    for (const field of ["titleBefore", "titleAfter", "headingBefore", "headingAfter"]) {
      assert.match(code, new RegExp(`\\b${field}\\b`), `${path} should still read ${field}`);
    }
    assert.match(code, /route\.control\b/, `${path} should still read route.control`);
  }
});
