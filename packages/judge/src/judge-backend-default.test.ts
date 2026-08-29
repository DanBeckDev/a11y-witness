import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// WHICH BACKEND THE JUDGE USES BY DEFAULT is stated in prose in several documents, and the code is the
// only authority. The default flipped from `codex` to `local` on 2026-08-04. `README.md` was corrected;
// `docs/getting-started.md` and `docs/METHODOLOGY.md` were not, and stayed wrong for months — so the
// onboarding document's FIRST instruction was `codex login`, authenticating against a rented model the
// tool does not use, and the methodology document rated the product's reproducibility on that model's
// behaviour rather than on 821 KB of pinned weights in this repo.
//
// A guard already existed and read exactly one file (`documented-criteria.test.ts` asserts the README).
// A remedy that reaches one of several sites is this repo's most expensive recurring shape, and a guard
// is not exempt from it. This one DISCOVERS the documents instead of naming them, so a new document
// making the claim is covered on the day it is written.

const ROOT = join(import.meta.dirname, "../../..");
const CODE = join(ROOT, "packages/judge/src/index.ts");

/** The authority: what `resolveBackend` actually falls back to. */
function defaultBackend(): string {
  const source = readFileSync(CODE, "utf8");
  const match = source.match(/process\.env\.JUDGE_BACKEND\s*\|\|\s*"([a-z]+)"/);
  assert.ok(match, "could not read the default backend out of judge/src/index.ts");
  return match[1];
}

/** Prose documents a reader would consult. Excludes the dated history, which is a record of what WAS. */
function documents(): string[] {
  const docs = readdirSync(join(ROOT, "docs"))
    .filter((f) => f.endsWith(".md") && !f.startsWith("history-"))
    .map((f) => join("docs", f));
  return ["README.md", "CONTRIBUTING.md", "CLAUDE.md", ...docs];
}

test("the default backend is local", () => {
  assert.equal(defaultBackend(), "local");
});

test("no document tells a reader to log into a rented backend as the default path", () => {
  // The symptom that actually cost something: `codex login` presented as a setup STEP. The word
  // appearing at all is fine — the rented backends are documented, and must stay documented.
  const offenders: string[] = [];
  for (const file of documents()) {
    let text: string;
    try {
      text = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue; // a document that does not exist in this checkout cannot make a claim
    }
    for (const line of text.split("\n")) {
      // A BLOCKQUOTE IS A QUOTATION, and this file's own correction quotes the stale sentence verbatim.
      // Flagging a document for recording what it used to say would make the record unwritable.
      if (line.trim().startsWith(">")) continue;
      // SENTENCE-SCOPED, not line-scoped. `[^.]` stops at the full stop, so README's correct
      // "the default judge is local. `JUDGE_BACKEND=anthropic|openai` swaps in a rented model"
      // is two claims and neither is "the default is a rented backend". A line-scoped version of this
      // test flagged it, and widening the exemption to rescue it is what made the FIRST version vacuous.
      const claimsRentedIsDefault = /\b(by default|defaults? to)\b[^.\n]{0,60}?\b(codex|anthropic|openai)\b/i;
      if (claimsRentedIsDefault.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 110)}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these lines claim a rented backend is the default; the code says "${defaultBackend()}":\n  ${offenders.join("\n  ")}`,
  );
});
