import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE DECLARATION OF WHAT A CAPTURE'S STATE AND FORM CHANGES ARE -- known-gaps §15's defect, one field over (#1603).
 *
 * §15 fixed `structure` being declared seven times; `structure-declarations.test.ts` guards it. The same defect stood
 * on `interaction`: eleven declarations outside the wire type spelled `stateChanges` or `formChanges` inline, and four
 * of them declared `formChanges[].kind` while `CaptureInteraction` did not -- the understating direction §15 names,
 * where object spread hides the gap at runtime for as long as it exists.
 *
 * Each declaration now derives from `CaptureInteraction`: the list itself, `Pick`, or indexed access to its element,
 * loosened where a consumer genuinely accepts more (every field optional, `after` admitting `null`) and saying why.
 * `tsc` enforces the derivation (a key the wire does not carry does not compile). What it cannot see is somebody
 * writing a fresh inline shape, which is how the eleven arose -- so this test reads for that.
 */
const ROOT = join(import.meta.dirname, "../../..");
const WIRE = "packages/evidence/src/index.ts";

/** Every non-test TypeScript source file under packages/, as [path, text] -- the §15 test's walk. */
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

/**
 * The declared type alone, off the rest of its line: an inline object through its closing brace and array suffix,
 * anything else up to the next `;`. An inline object's own `;` separators are why it cannot simply stop at the first.
 */
function shapeOf(rest: string): string {
  if (!rest.startsWith("{")) return rest.split(";")[0].trim();
  const close = rest.indexOf("}");
  if (close < 0) return rest;
  return rest.slice(0, close + 1) + (/^\s*\[\]/.exec(rest.slice(close + 1))?.[0].trim() ?? "");
}

/**
 * Every place one file's text restates a change list rather than deriving it: a property typed as an inline object,
 * as `unknown[]`, or as an array of an interface or object-literal alias declared in the same file; or a cast to an
 * inline object. A derived form -- `CaptureInteraction[...]`, `Pick<>`, `Partial<>`, a parenthesised intersection
 * starting from one -- is none of these, and neither is a string value that merely names a field.
 */
export function restatements(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\b(stateChanges|formChanges)\??:\s*([^\n]+)/g)) {
    const type = shapeOf(match[2].trim().replace(/^\(+/, ""));
    const local = /^(\w+)\[\]/.exec(type);
    const localShape = local !== null
      && new RegExp(`\\b(?:interface\\s+${local[1]}\\b|type\\s+${local[1]}\\s*=\\s*\\{)`).test(text);
    if (type.startsWith("{") || /^unknown\b/.test(type) || localShape) found.push(`${match[1]}: ${type}`);
  }
  for (const match of text.matchAll(/\b(stateChanges|formChanges)\s+as\s+(\{[^}]*\}\[\])/g)) {
    found.push(`${match[1]} as ${match[2]}`);
  }
  return found;
}

/** The files among `entries` that restate a change list, each with what it wrote. */
function offendersIn(entries: [string, string][]): string[] {
  return entries.filter(([path]) => path !== WIRE)
    .flatMap(([path, text]) => restatements(text).map((shape) => `${path}: ${shape}`));
}

/**
 * THE DECLARATIONS #1603 DERIVED, named with the text that proves each reaches the wire type -- the §15 test's second
 * half. Named rather than discovered, because a derived type is not greppable by field; `tsc` proves the keys.
 */
const DERIVED = [
  ["packages/evidence/src/left-site.ts", 'Pick<CaptureInteraction["stateChanges"][number], "control">'],
  ["packages/evidence/src/left-site.ts", 'Omit<CaptureInteraction["formChanges"][number], "after">'],
  ["packages/evidence/src/verify.ts", 'stateChanges: CaptureInteraction["stateChanges"];'],
  ["packages/evidence/src/verify.ts", 'Omit<CaptureInteraction["formChanges"][number], "after">'],
  ["packages/judge/src/local-judge.ts", 'Record<keyof CaptureInteraction["stateChanges"][number], unknown>'],
  ["packages/judge/src/local-judge.ts", 'Omit<CaptureInteraction["formChanges"][number], "after">'],
  ["packages/judge/src/rules.ts", 'stateChanges?: CaptureInteraction["stateChanges"];'],
  ["packages/judge/src/rules.ts", 'Omit<CaptureInteraction["formChanges"][number], "after">'],
  ["packages/lab/src/harnesses/judge-file.ts", 'Pick<CaptureInteraction, "controls" | "stateChanges">'],
  ["packages/scorer/src/evidence-units.ts", 'Omit<CaptureInteraction["stateChanges"][number], "after">'],
] as const;

test("#1603: no TypeScript source outside the wire type restates a state or form change list", () => {
  const offenders = offendersIn(sources());
  assert.deepEqual(offenders, [], "these restate a capture's change list instead of deriving from CaptureInteraction, "
    + `which is how eleven declarations came to disagree with the wire:\n  ${offenders.join("\n  ")}`);
});

test("#1603 CONTROL: every derived declaration is in the scanned population and reaches the wire type", () => {
  const scanned = new Map(sources());
  for (const [file, needle] of DERIVED) {
    // In the population, so an empty or misdirected walk cannot pass the scan above.
    const text = scanned.get(file);
    assert.ok(text !== undefined, `${file} is not in the scanned population -- the walk is not reading the tree`);
    assert.ok(text.includes(needle), `${file} must derive its change list from the wire type (${needle})`);
  }
});

test("#1603 MUTATION: re-adding the inline `stateChanges` shape to any one consumer is named by that file", () => {
  const readdition = "\n    stateChanges?: { control: string; after: string }[];\n";
  for (const file of new Set(DERIVED.map(([path]) => path))) {
    const mutated = sources().map(([path, text]): [string, string] => [path, path === file ? text + readdition : text]);
    assert.deepEqual(offendersIn(mutated), [`${file}: stateChanges: { control: string; after: string }[]`], file);
  }
});

test("#1603: each restatement shape is caught, and each derived shape or string value is not", () => {
  const caught = [
    "stateChanges?: { control: string; after: string }[];",
    "formChanges?: ({ control?: string })[];",
    "controls?: string[]; stateChanges?: unknown[]; postSubmitFields?: string[];",
    "interface AnnouncedChange { control?: string }\n  formChanges?: AnnouncedChange[];",
    "type Local = { control: string };\n  stateChanges: Local[];",
    "const changes = interaction.formChanges as { control?: string }[];",
  ];
  for (const text of caught) assert.equal(restatements(text).length, 1, text);
  const derived = [
    'stateChanges?: CaptureInteraction["stateChanges"];',
    'interaction?: Pick<CaptureInteraction, "controls" | "stateChanges">;',
    'formChanges?: (Partial<Omit<CaptureInteraction["formChanges"][number], "after">> & { after?: string | null })[];',
    'type AnnouncedChange = Partial<CaptureInteraction["stateChanges"][number]>;\n  stateChanges?: AnnouncedChange[];',
    'stateChanges: "interaction",',
  ];
  for (const text of derived) assert.deepEqual(restatements(text), [], text);
});
