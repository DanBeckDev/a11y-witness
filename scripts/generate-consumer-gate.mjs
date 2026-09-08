#!/usr/bin/env node
// @ts-check
// command: regenerate .github/workflows/consumer-gate.yml from README.md's own documented workflow
// #494: `action-smoke` IS GREEN AND COULD NEVER HAVE CAUGHT #491/#492/#493 -- IT HAS REPO KNOWLEDGE.
//
// `action-smoke.yml` runs `uses: ./` inside this repo's own checkout: it needs no `actions/checkout`
// step because the workspace already IS the repository, it never reads the public documents, and it
// never forms an expectation the output could disappoint. The V1 rehearsal (#324) proved that gap three
// times on a real windows-2022 runner: a fresh reader following only the public docs got an empty
// workspace (no `actions/checkout` in any of them), the build died on Windows, and the failure message
// lied about where the report was.
//
// This generates a workflow whose STEPS are the ones a reader would actually copy -- extracted from
// README.md's own Quickstart fence, not hand-retyped, so it cannot silently drift from what the README
// says. Two rules keep it honest:
//
//   1. NOTHING IS ADDED THE DOCUMENT DOES NOT GIVE. If README.md's fence has no `actions/checkout` step,
//      the generated workflow has none either, and the gate must fail on windows-2022 for the identical
//      reason a reader's own workflow would -- `setup-node`'s `cache: npm` dying on "lock file not
//      found" (#491). Adding a checkout step here "to make it pass" is `action-smoke` with more steps.
//   2. ONLY the `url`/`task` VALUES are substituted, never a key added or removed. The README's own
//      values are illustrative placeholders (`https://example.com/checkout`, `https://your-site.example`)
//      that cannot actually be captured; a real, stable public page is substituted so the gate can
//      produce a genuine report, exactly as `action-smoke.yml` substitutes a real W3C page for "your
//      site". Every other line — whether a checkout step exists, the exact `uses:` ref — passes through
//      unedited.
//
// PINNED TO THIS COMMIT, NOT `@main` -- #494's own acceptance. A tag that moves makes the test's subject
// change under it.
//
// PINNED AS A LITERAL SHA, NOT AN EXPRESSION -- `uses:` steps do not accept `${{ }}` at all ("no context
// is available here", verified with `actionlint` before trusting it). `release.yml` gets its "runs
// against the exact sha this workflow was dispatched at" property from a DIFFERENT mechanism --
// `uses: ./.github/workflows/action-smoke.yml` calls another workflow in this SAME repo, which GitHub
// always resolves at the calling workflow's own ref; that mechanism does not extend to an ACTION
// reference inside a step. So the sha is resolved HERE, at generation time (`git rev-parse HEAD`), and
// baked in as a literal string -- the same discipline `docs/commands.md` (A6b, #478) already established
// for a generated-and-tracked file: `--check` fails if the committed file does not match what generating
// from the CURRENT HEAD would produce, so a stale pin cannot silently ship as part of a release.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";
import { sandboxGitEnv } from "./git-env.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
export const README_PATH = `${REPO}README.md`;
export const OUT = `${REPO}.github/workflows/consumer-gate.yml`;

/** The action reference this generator looks for -- the one line that identifies the right fence among
 *  several code blocks in README.md, and the one whose ref gets pinned. */
const ACTION_REF = "DanBeckDev/a11y-witness";

/**
 * Extracts the first fenced ```yaml block in `markdown` that contains a `uses: <ACTION_REF>` line --
 * the documented consumer workflow, not any other yaml example the document happens to carry.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function extractDocumentedJobsBlock(markdown) {
  const fences = markdown.matchAll(/```yaml\n([\s\S]*?)```/g);
  for (const m of fences) {
    if (m[1].includes(`uses: ${ACTION_REF}`)) return m[1].trimEnd();
  }
  throw new Error(`no \`\`\`yaml fence containing "uses: ${ACTION_REF}" found in ${README_PATH} -- `
    + "the Quickstart section may have moved or been reworded");
}

/**
 * Pins the `DanBeckDev/a11y-witness@<ref>` step to `sha` -- and ONLY that line. A workflow snippet may
 * carry other `uses:` steps (`actions/checkout@v4`) that must not be touched.
 *
 * @param {string} yamlText
 * @param {string} sha
 * @returns {string}
 */
export function pinActionRef(yamlText, sha) {
  const pattern = new RegExp(`uses: ${ACTION_REF}@[^\\s]+`);
  if (!pattern.test(yamlText)) {
    throw new Error(`no "uses: ${ACTION_REF}@<ref>" line found to pin -- the extraction may have `
      + "captured the wrong fence");
  }
  return yamlText.replace(pattern, `uses: ${ACTION_REF}@${sha}`);
}

/**
 * Replaces the `url:`/`task:` VALUES only, preserving every key, every other line, and all indentation.
 * The README's own values are placeholders (`https://example.com/checkout`, "Complete the checkout")
 * that no real page answers to -- this is the one deliberate substitution #494 allows, so the gate can
 * produce a genuine report rather than timing out against a domain nothing serves.
 *
 * @param {string} yamlText
 * @param {{ url: string, task: string }} target
 * @returns {string}
 */
export function substituteTarget(yamlText, target) {
  let out = yamlText.replace(/^(\s*url:\s*).*$/m, `$1${target.url}`);
  if (!/^(\s*url:\s*)/m.test(yamlText)) {
    throw new Error("no \"url:\" line found to substitute -- the extraction may have captured the wrong fence");
  }
  out = out.replace(/^(\s*task:\s*).*$/m, `$1${target.task}`);
  if (!/^(\s*task:\s*)/m.test(yamlText)) {
    throw new Error("no \"task:\" line found to substitute -- the extraction may have captured the wrong fence");
  }
  return out;
}

/**
 * The job key README's own snippet declares under `jobs:` (currently `a11y`) -- read rather than assumed,
 * so a rename in the document does not silently leave the verify step referencing a job that no longer
 * exists (which would fail as "invalid needs" rather than the real defect, this repo's own "a wrong
 * answer that looks like the right kind of failure" shape).
 *
 * @param {string} jobsYaml
 * @returns {string}
 */
export function extractJobName(jobsYaml) {
  const m = /^jobs:\n {2}(\S+):/m.exec(jobsYaml);
  if (!m) throw new Error("no job key found under \"jobs:\" -- the extraction may have captured the wrong fence");
  return m[1];
}

/**
 * Re-indents a `jobs:`-rooted snippet under a two-space workflow envelope and wraps it with the minimal
 * top-level keys a standalone workflow needs (`name`, `on`) that README's own snippet deliberately omits
 * (it assumes a reader is adding a job to a workflow they already have).
 *
 * NO `permissions:` BLOCK ADDED. `action.yml`'s own docs state the report always lands in the job
 * summary regardless of permissions; only the optional PR-comment step needs `pull-requests: write`, and
 * #494's acceptance is "produces a report", not "posts a comment" -- adding a permission the README
 * never mentions would be exactly the kind of help this gate exists to refuse.
 *
 * @param {string} jobsYaml
 * @returns {string}
 */
export function buildConsumerGateWorkflow(jobsYaml) {
  const jobName = extractJobName(jobsYaml);
  const header = [
    "# GENERATED by `node scripts/run.mjs consumer-gate` from README.md's own Quickstart fence.",
    "# Do not edit by hand -- packages/lab/src/packaging/consumer-gate.test.ts checks this file against",
    "# the document it was generated from. See scripts/generate-consumer-gate.mjs's own header for why.",
    "#",
    "# #494: a CONSUMER-shaped gate. Unlike action-smoke.yml (uses: ./, repo knowledge, no checkout",
    "# needed), this workspace starts EMPTY -- no actions/checkout of a11y-witness itself -- and its steps",
    "# are exactly what README.md tells a reader to write, values substituted for a real target only.",
    "# If the documented workflow is missing something a real run needs, this fails for the identical",
    "# reason a reader's own copy would.",
    "name: consumer-gate",
    "",
    "on:",
    "  workflow_call:",
    "  workflow_dispatch:",
    "",
  ].join("\n");

  // `jobsYaml` already starts with its own "jobs:" line (README's fence is rooted there), so it is
  // pasted as-is rather than re-wrapped in a second "jobs:" -- the double-key bug this comment exists to
  // stop being reintroduced.
  const verify = [
    "",
    "  verify-report:",
    `    needs: [${jobName}]`,
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: A report must exist -- refuse rather than pass on absence",
    "        run: |",
    `          if [ "\${{ needs.${jobName}.result }}" != "success" ]; then`,
    `            echo "::error::the documented workflow's own job did not succeed (\${{ needs.${jobName}.result }}) --"`,
    "            echo \"::error::a reader following only README.md would have hit exactly this\"",
    "            exit 1",
    "          fi",
  ].join("\n");

  return `${header}\n${jobsYaml}\n${verify}\n`;
}

/** The real, current commit HEAD is on -- what the generated file's `uses:` step gets pinned to. */
export function currentHeadSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, env: sandboxGitEnv(), encoding: "utf8" }).trim();
}

/**
 * Pure end-to-end build: README text + the sha to pin -> the full generated workflow text.
 * @param {string} readmeText
 * @param {string} sha
 * @returns {string}
 */
export function generate(readmeText, sha) {
  const jobsBlock = extractDocumentedJobsBlock(readmeText);
  const pinned = pinActionRef(jobsBlock, sha);
  const targeted = substituteTarget(pinned, {
    url: "https://www.w3.org/WAI/demos/bad/before/home.html",
    task: "Find the main navigation and reach the survey.",
  });
  return buildConsumerGateWorkflow(targeted);
}

function main() {
  refuseUnknownFlags(["--check"], { entry: import.meta.url, command: "node scripts/generate-consumer-gate.mjs" });
  const readme = readFileSync(README_PATH, "utf8");
  const workflow = generate(readme, currentHeadSha());
  if (process.argv.includes("--check")) {
    const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    // The sha is the ONE line expected to differ between two otherwise-identical generations taken a
    // commit apart -- comparing everything else lets a real drift (README changed, generator changed)
    // fail while a routine "HEAD moved since this was last generated" reads as what it is: expected,
    // fixed by regenerating as the last step before a release, never a surprise mid-review.
    /** @param {string} text */
    const stripSha = (text) => text.replace(/uses: DanBeckDev\/a11y-witness@\S+/, "uses: DanBeckDev/a11y-witness@<sha>");
    if (stripSha(current) !== stripSha(workflow)) {
      console.error(`STALE  ${OUT} does not match README.md. Run: node scripts/run.mjs consumer-gate`);
      process.exitCode = 1;
      return;
    }
    if (current !== workflow) {
      console.error(`STALE-SHA  ${OUT} is pinned to an older commit than HEAD -- regenerate before releasing: `
        + "node scripts/run.mjs consumer-gate");
      process.exitCode = 1;
      return;
    }
    console.log(`OK  ${OUT} matches README.md and is pinned to HEAD.`);
    return;
  }
  writeFileSync(OUT, workflow);
  console.log(`WROTE  ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
