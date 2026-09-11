// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): `docs/known-gaps.md`'s index is a DERIVED view of its headings -- every
// open section linked, every closed or meta section not. The rule already lives in
// `scripts/known-gaps-index.mjs` (the generator `known-gaps-index.test.ts` asserts on), so this composes it
// rather than restating it: a disagreement is a line the freshly built index has and the committed one lacks,
// or the reverse.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { KNOWN_GAPS_FILE, buildIndexBlock, currentIndexBlock, parseHeadings } from "../known-gaps-index.mjs";

/** The index's entry lines -- the ones that name a section. @param {string | null} block @returns {string[]} */
const entries = (block) => (block ?? "").split("\n").filter((line) => line.startsWith("- "));

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const path = join(root, KNOWN_GAPS_FILE);
  if (!existsSync(path)) return { examined: 0, unit: `section headings in ${KNOWN_GAPS_FILE}`, disagreements: [] };
  const text = readFileSync(path, "utf8");
  const committed = currentIndexBlock(text);
  const fresh = entries(buildIndexBlock(text));
  const current = entries(committed);
  const disagreements = committed === null
    ? [{ where: KNOWN_GAPS_FILE, reference: "known-gaps-index block", why: "the file has no index block at all" }]
    : [
      ...fresh.filter((line) => !current.includes(line)).map((line) => ({ where: KNOWN_GAPS_FILE, reference: line,
        why: "an open section the committed index does not list -- run `npm run docs:known-gaps-index -- --write`" })),
      ...current.filter((line) => !fresh.includes(line)).map((line) => ({ where: KNOWN_GAPS_FILE, reference: line,
        why: "the committed index lists this, and the headings no longer produce it (closed, renamed or gone)" })),
    ];
  return { examined: parseHeadings(text).length, unit: `section headings in ${KNOWN_GAPS_FILE}`, disagreements };
}
