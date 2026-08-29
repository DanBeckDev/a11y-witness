import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE DECLARATION OF WHAT A CAPTURE'S `structure` IS — known-gaps §15.
 *
 * It was declared independently in five places, and they disagreed. `JudgeInput` omitted `graphics` while
 * `addUnnamedGraphics` read it, and nothing noticed, because OBJECT SPREAD PRESERVES WHAT A TYPE DOES NOT
 * MENTION: the runtime was unaffected and the type understated what flows, so a caller building the
 * literal by hand would silently have starved the rule.
 *
 * Each declaration is now `CaptureStructure`, `Pick<>` or `Partial<>` of it, so a consumer that reads a
 * genuine subset still says so — no rule reads `landmarks`, and declaring it would claim a capability that
 * does not exist — while none of them can name a field the wire does not carry.
 *
 * `tsc` enforces the derivation itself (a `Pick` of a key that is not on `CaptureStructure` does not
 * compile). What it CANNOT see is somebody writing a fresh inline object type, which is exactly how the
 * five copies arose — so this test reads for that shape.
 */
const ROOT = join(import.meta.dirname, "../../..");

/** Every non-test source file under packages/, as [path, text]. */
function sources(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") || /\.test\.ts$/.test(entry.name)) continue;
      out.push([path.slice(ROOT.length + 1), readFileSync(path, "utf8")]);
    }
  };
  walk(join(ROOT, "packages"));
  return out;
}

test("no TypeScript declaration spells out the sweep fields inline", () => {
  // The signature of a sixth copy: `structure?: {` followed by a brace-list naming the sweeps, rather
  // than a reference to `CaptureStructure`. `index.ts` is where the wire type itself lives.
  const offenders: string[] = [];
  for (const [path, text] of sources()) {
    if (path.endsWith("packages/evidence/src/index.ts")) continue;
    for (const match of text.matchAll(/structure\??:\s*\{([^}]*)\}/g)) {
      const body = match[1];
      const names = ["headings", "landmarks", "formFields", "links", "graphics", "lists", "tableCells"]
        .filter((f) => new RegExp(`\\b${f}\\??\\s*:`).test(body));
      // One or two fields is a local shape (a test fixture, a narrow argument); three or more is a
      // restatement of the wire type, which is what drifted.
      if (names.length >= 3) offenders.push(`${path}: {${names.join(", ")}}`);
    }
  }
  assert.deepEqual(offenders, [], "these restate the capture's structure inline instead of deriving from "
    + `CaptureStructure, which is how five declarations came to disagree:\n  ${offenders.join("\n  ")}`);
});

test("every declaration is reachable from the wire type", () => {
  // Named rather than discovered, because a `Pick<CaptureStructure, ...>` is not greppable by field. The
  // point is that all four resolve through `CaptureStructure`; `tsc` proves the keys are real.
  const derived = [
    ["packages/judge/src/judge.ts", "CaptureStructure"],
    ["packages/judge/src/rules.ts", "Pick<CaptureStructure"],
    ["packages/judge/src/local-judge.ts", "Partial<CaptureStructure>"],
    ["packages/evidence/src/verify.ts", "Pick<CaptureStructure"],
    // The gap listed five declarations. There were SEVEN — these three were found only by running the
    // discovery test above, which is the argument for discovering rather than listing.
    ["packages/cli/src/cli.ts", "Pick<CaptureStructure"],
    ["packages/lab/src/harnesses/judge-file.ts", "Pick<CaptureStructure"],
    ["packages/scorer/src/evidence-units.ts", "Pick<CaptureStructure"],
  ] as const;
  for (const [file, needle] of derived) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.ok(text.includes(needle), `${file} must derive its structure from the wire type (${needle})`);
  }
});
