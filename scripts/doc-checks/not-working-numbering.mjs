// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): `docs/not-working.md`'s section numbers are unambiguous -- one bare
// (current) heading per number, every lettered heading pointing at a bare sibling, letters contiguous from
// `a`. This is the invariant that makes a `§N` citation into that page RESOLVABLE, which is why it moves with
// `doc-citation-integrity` (product-manager's ruling on #905). Moved out of `not-working-numbering.test.ts`,
// which now asserts on these same functions; see its header for the scheme and why it exists.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const DOC = "docs/not-working.md";

/**
 * @typedef {{ depth: number, number: string, letter: string, title: string, line: number }} Heading
 * `letter` is empty for a bare (current) heading; one lowercase letter for a superseded or collided one.
 */

/**
 * Every numbered heading on the page, at any depth from 2 to 4 hashes.
 * @param {string} root @returns {Heading[]}
 */
export function headings(root) {
  const path = join(root, DOC);
  if (!existsSync(path)) return [];
  /** @type {Heading[]} */
  const found = [];
  readFileSync(path, "utf8").split("\n").forEach((line, index) => {
    const match = /^(#{2,4}) (\d+)([a-z]?)\.\s*(.+)$/.exec(line);
    if (match) found.push({ depth: match[1].length, number: match[2], letter: match[3], title: match[4], line: index + 1 });
  });
  return found;
}

/** @param {Heading[]} hs @returns {Map<string, Heading[]>} */
export function byNumber(hs) {
  /** @type {Map<string, Heading[]>} */
  const out = new Map();
  for (const h of hs) out.set(h.number, [...(out.get(h.number) ?? []), h]);
  return out;
}

/**
 * Numbers with more than one BARE heading -- two entries each claiming to be current.
 * @param {Heading[]} hs @returns {{ number: string, bare: Heading[] }[]}
 */
export function duplicateCurrentNumbers(hs) {
  return [...byNumber(hs).entries()]
    .map(([number, group]) => ({ number, bare: group.filter((h) => h.letter === "") }))
    .filter(({ bare }) => bare.length > 1);
}

/**
 * Lettered headings whose base number has no bare sibling -- a pointer to a current entry that is gone.
 * @param {Heading[]} hs @returns {string[]}
 */
export function orphanedLetters(hs) {
  const bareNumbers = new Set(hs.filter((h) => h.letter === "").map((h) => h.number));
  return hs.filter((h) => h.letter !== "" && !bareNumbers.has(h.number))
    .map((h) => `line ${h.line}: "§${h.number}${h.letter}" has no bare "§${h.number}" on the page`);
}

/**
 * Duplicate groups whose letters are not unique and contiguous from `a`.
 * @param {Heading[]} hs @returns {string[]}
 */
export function badLetterGroups(hs) {
  /** @type {Map<string, string[]>} */
  const letters = new Map();
  for (const h of hs) if (h.letter !== "") letters.set(h.number, [...(letters.get(h.number) ?? []), h.letter]);
  const bad = [];
  for (const [number, found] of letters) {
    const sorted = [...found].sort();
    const expected = Array.from({ length: found.length }, (_, i) => String.fromCharCode(97 + i));
    if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
      bad.push(`§${number}: letters found ${JSON.stringify(sorted)}, expected ${JSON.stringify(expected)}`);
    }
  }
  return bad;
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const hs = headings(root);
  return {
    examined: hs.length,
    unit: `numbered headings in ${DOC}`,
    disagreements: [
      ...duplicateCurrentNumbers(hs).map(({ number, bare }) => ({ where: DOC, reference: `§${number}`,
        why: `${bare.length} headings each claim to be current: ${bare.map((h) => `line ${h.line}`).join(", ")}` })),
      ...orphanedLetters(hs).map((detail) => ({ where: DOC, reference: detail.split(":")[0], why: detail })),
      ...badLetterGroups(hs).map((detail) => ({ where: DOC, reference: detail.split(":")[0], why: detail })),
    ],
  };
}
