/**
 * Run the axe-core rule-based scan against a URL or local file.
 * Usage: npm run scan -- <url|path>
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { scanWithAxe } from "./axe.js";

async function main(): Promise<void> {
  let target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run scan -- <url|path>");
    process.exit(1);
  }
  if (!/^(https?|file):/.test(target) && existsSync(target)) {
    target = pathToFileURL(resolve(target)).href;
  }
  const findings = await scanWithAxe(target);
  console.log(`\naxe-core (rule-based layer): ${findings.length} violation(s) on ${target}\n`);
  for (const f of findings) {
    console.log(`  [${f.impact}] ${f.wcag.join(", ") || "(no SC tag)"}  ${f.rule}`);
    console.log(`     ${f.help}`);
    for (const n of f.nodes.slice(0, 2)) console.log(`     evidence: ${n.html.slice(0, 100)}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
