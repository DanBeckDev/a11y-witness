// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): `docs/roles/README.md`'s roster links each role to its file, and each linked
// file names its own agent, its reporter, its lane and its ban. Moved out of `roles-readme.test.ts`, which now
// asserts on these same functions. If `docs/roles/` has gone stale with the org it describes, this is where the
// nightly report will say so -- deleting it is not #905's call (product-manager's ruling).
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

export const README_PATH = "docs/roles/README.md";

/**
 * @typedef {{ role: string, agent: string, linkText: string, filePath: string, reporter: string | null }} RosterRow
 * `filePath` is repo-relative, resolved from the README's own location; `reporter` is null for "—" (nobody).
 */

/**
 * Parses the roster table's rows: `| role | \`agent\` | [linkText](./file.md) | reports-to |`. Table-row
 * parsing, not a general markdown parser, because a general parser hides a shape change instead of failing.
 * @param {string} readmeSource @returns {RosterRow[]}
 */
export function roster(readmeSource) {
  /** @type {RosterRow[]} */
  const rows = [];
  for (const line of readmeSource.split("\n")) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*`([^`]+)`\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.+?)\s*\|$/);
    if (!m) continue;
    const [, role, agent, linkText, linkPath, reporterCell] = m;
    if (role === "role") continue; // the header row
    rows.push({ role, agent, linkText, filePath: join(dirname(README_PATH), linkPath),
      reporter: reporterCell.match(/`([^`]+)`/)?.[1] ?? null });
  }
  return rows;
}

/** @param {string} root @returns {string} the README, or "" when there is none */
export function readmeSource(root) {
  const path = resolve(root, README_PATH);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * Splits the roster into files that do not exist and existing files missing one of the four required parts.
 * @param {RosterRow[]} rows @param {string} [root] what a repo-relative `filePath` resolves against
 * @returns {{ missing: string[], incomplete: string[] }}
 */
export function checkRoster(rows, root = process.cwd()) {
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const incomplete = [];
  for (const { agent, filePath, reporter } of rows) {
    if (!existsSync(resolve(root, filePath))) {
      missing.push(`  ${agent} -> ${filePath}`);
      continue;
    }
    const source = readFileSync(resolve(root, filePath), "utf8");
    const problems = [];
    if (!source.includes(`\`${agent}\``)) problems.push("never mentions its own agent name in backticks");
    if (reporter && !source.includes(`\`${reporter}\``)) problems.push(`never mentions its reporter (\`${reporter}\`) by name`);
    if (!/^#+.*\b(lane|owns|role)\b/im.test(source)) problems.push("no heading naming its lane/role/what it owns");
    // Either the literal resource-ban text, or an explicit statement of exception -- checked as "addressed the
    // topic at all", never as an exact phrasing, because some roles exist precisely to be the ban's exception.
    if (!/collision into a silent wrong answer|must never do|the resource ban|\bexception\b|drive the fleet/i.test(source)) {
      problems.push("no ban section and no stated exception to it");
    }
    if (problems.length) incomplete.push(`  ${agent} (${filePath}): ${problems.join("; ")}`);
  }
  return { missing, incomplete };
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const rows = roster(readmeSource(root));
  const { missing, incomplete } = checkRoster(rows, root);
  return {
    examined: rows.length,
    unit: `roster rows in ${README_PATH}`,
    disagreements: [
      ...missing.map((line) => ({ where: README_PATH, reference: line.trim(),
        why: "the roster links a role file that does not exist" })),
      ...incomplete.map((line) => ({ where: README_PATH, reference: line.trim().split(" ")[0],
        why: line.trim() })),
    ],
  };
}
