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
// baked in as a literal string -- the same MECHANISM `docs/commands.md` (A6b, #478) established for a
// generated-and-tracked file, but see #558 immediately below for where the analogy stops: unlike a plain
// markdown doc, this file EMBEDS a reference to its own future commit, which changes what `--check` can
// actually prove.
//
// #558, PART 1: `--check` USED TO ALSO REQUIRE THE PIN TO EQUAL HEAD, AND THAT IS UNSATISFIABLE IN ANY
// COMMITTED TREE. Regenerate at HEAD `X` and the file pins `X`; commit that file and HEAD becomes the NEW
// commit `Y` (the one containing the change) -- the committed pin can never equal HEAD by the time
// anything reads it back. Measured directly: `release.yml`'s own `--check` gate step failed on a freshly
// cloned `main`, on a commit that had JUST regenerated correctly. `main()`'s `--check` mode now compares
// everything BUT the sha (see its own comment); asserting pin-equals-HEAD is not this script's job any
// more, because nothing could ever have satisfied it.
//
// #558, PART 2: `--check` RUNS AT RELEASE TIME, AND NOTHING EQUIVALENT RAN AT DISPATCH TIME -- which is
// the gap that actually needed a fix, not the unsatisfiable comparison above. Three of five live
// dispatches on 2026-09-08 were RED purely because the pin was stale -- one against `main` before #492
// merged, and (the clearest case) one against a branch that had forked before its OWN fix was regenerated
// in, producing the IDENTICAL sha and the IDENTICAL error as the run before it. A stale pin makes a
// dispatch fail on whatever defect the OLD sha happened to carry, which reads exactly like a new bug and
// cost a round trip each time.
//
// So the generated workflow now carries its own `check-pin` job, gating `a11y` via `needs:`, that
// compares the pinned sha against `${{ github.sha }}` -- THE COMMIT THIS RUN IS ACTUALLY EXECUTING AT,
// not a query against `main` specifically. That is deliberate: `github.sha` for a `workflow_dispatch`
// resolves to the tip of whatever ref was dispatched, so the same check is correct whether the dispatch
// is against `main` (the release path) or a feature branch whose pin was just regenerated to its own HEAD
// (the corroboration path used to prove a fix before it merges) -- a literal "must equal main" check would
// refuse the second, legitimate case. `check-pin` runs on `ubuntu-latest`, before `a11y`'s `windows-2022`
// spin-up, so a stale pin now fails in seconds rather than burning a real capture run to say so. This is
// the question `--check`'s removed comparison was reaching for and could never answer at rest: whether
// the pin was regenerated for the commit actually running is only answerable AT dispatch, not in storage.
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

/** Top-level keys `buildWorkflowHeader`/`buildConsumerGateWorkflow` wrap themselves -- a fence carrying
 *  either of its own produces a DUPLICATE key once spliced in. */
const WRAPPED_TOP_LEVEL_KEYS = ["on", "name"];

/**
 * #796: A DUPLICATE on:/name: DID NOT ERROR -- IT SILENTLY DROPPED A WHOLE JOB. Measured live: this
 * repo's own README.md briefly carried a top-level `on: pull_request` above its `jobs:` line, and
 * `buildConsumerGateWorkflow`'s `jobsYaml.replace(/^jobs:\n/, ...)` anchors to the STRING's own start
 * (no `/m` flag) -- a fence that does not literally BEGIN "jobs:\n" makes that splice a silent no-op, so
 * `check-pin` vanished from the generated file with no error at all. A guard that produces nothing where
 * it should refuse is worse than no guard, so this is checked here, before any splicing, rather than
 * left for a diff to eventually notice.
 * @param {string} jobsYaml
 */
function refuseWrappedTopLevelKey(jobsYaml) {
  const found = WRAPPED_TOP_LEVEL_KEYS.find((key) => new RegExp(`^${key}:`, "m").test(jobsYaml));
  if (!found) return;
  throw new Error(`${README_PATH}'s Quickstart fence carries its own top-level "${found}:" key -- this `
    + `generator wraps ${WRAPPED_TOP_LEVEL_KEYS.map((k) => `"${k}:"`).join(" and ")} itself `
    + "(buildWorkflowHeader), so a second one produces a duplicate YAML key and silently drops the "
    + "check-pin job rather than failing loudly. The fence must be a bare `jobs:`-rooted fragment -- what "
    + "a reader adds to a workflow they already have, never a standalone one.");
}

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
    if (m[1].includes(`uses: ${ACTION_REF}`)) {
      const jobsYaml = m[1].trimEnd();
      refuseWrappedTopLevelKey(jobsYaml);
      return jobsYaml;
    }
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
 * The sha `pinActionRef` already baked into `jobsYaml`'s own `uses:` line -- READ back rather than
 * threaded through as a second parameter, so `check-pin`'s comparison and the `a11y` job's own `uses:`
 * step can never independently drift (#558's "derive one from the other", the same reason `extractJobName`
 * reads the job key instead of assuming `a11y`).
 *
 * @param {string} jobsYaml
 * @returns {string}
 */
export function extractPinnedSha(jobsYaml) {
  const m = new RegExp(`uses: ${ACTION_REF}@(\\S+)`).exec(jobsYaml);
  if (!m) throw new Error(`no "uses: ${ACTION_REF}@<sha>" line found -- pinActionRef may not have run yet`);
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
 * #558: `needs: [check-pin]` IS INSERTED INTO THE EXTRACTED JOB, deliberately, and this is not the same
 * kind of addition rule #1 (above) forbids. That rule is about the job's own STEPS -- what a reader would
 * actually copy -- and neither `check-pin` nor this `needs:` line touches them; it is job-level
 * orchestration the generator already adds for `verify-report` below. A reader copying just the steps
 * from README still gets exactly what README shows.
 *
 * @param {string} jobsYaml
 * @returns {string}
 */
export function buildConsumerGateWorkflow(jobsYaml) {
  const jobName = extractJobName(jobsYaml);
  const pinnedSha = extractPinnedSha(jobsYaml);
  const header = buildWorkflowHeader();
  const checkPin = buildCheckPinJob(pinnedSha);

  // `jobsYaml` already starts with its own "jobs:" line (README's fence is rooted there). The check-pin
  // job is spliced in right after it, and `needs: [check-pin]` right after the extracted job's own name
  // line -- both string operations, never a re-wrap of the whole block, which is the double-key bug this
  // comment exists to stop being reintroduced.
  const withCheckPin = jobsYaml.replace(/^jobs:\n/, `jobs:\n${checkPin}`)
    .replace(new RegExp(`^(  ${jobName}:\\n)`, "m"), `$1    needs: [check-pin]\n`);

  return `${header}\n${withCheckPin}\n${buildVerifyReportJob(jobName)}\n`;
}

/** The `name:`/`on:` envelope every generated workflow needs, that README's own snippet omits. */
function buildWorkflowHeader() {
  return [
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
}

/**
 * #558: a stale pin is diagnosed HERE, on ubuntu-latest, before the windows-2022 job it gates ever
 * starts -- three of five real dispatches on 2026-09-08 were red purely because the pin had not been
 * regenerated for the commit actually running, and each cost a full Windows spin-up to say so.
 *
 * NOT EXACT EQUALITY AGAINST `github.sha` -- THAT HAS THE IDENTICAL UNSATISFIABLE SHAPE `--check`'s OLD
 * sha comparison did (see this file's own top-of-file comment), just moved from commit time to dispatch
 * time. Regenerating at commit `A` bakes a pin of `A`; COMMITTING that regeneration creates commit `B`
 * (parent `A`) that CONTAINS the pin of `A` -- so the commit a dispatch actually runs at (`github.sha`)
 * is `B`, never `A`, for the identical structural reason a committed file can never equal its own HEAD.
 * Exact equality here would refuse every dispatch, forever, which is worse than the gap it replaces.
 *
 * SO: is the pin an ANCESTOR of `github.sha`, AND has nothing that would CHANGE the generated content
 * (README.md, this generator) landed since the pin -- rather than "is it identical". That is
 * satisfiable by the normal regenerate-then-commit-then-dispatch sequence (the pin is the immediate
 * parent, an ancestor by definition, and nothing else has landed yet), tolerates ordinary commits
 * landing on OTHER files between regeneration and dispatch, and still refuses the real defect class:
 * a pin left behind while README.md or the generator itself moved on. Two separate refusals, because
 * "not in this history at all" and "in this history but stale relative to a real change" need opposite
 * fixes and must not print the same word.
 *
 * `github.sha`, NOT A QUERY AGAINST `main`. `github.sha` for `workflow_dispatch` is the tip of whatever
 * ref was dispatched; under `workflow_call` (release.yml) it is the caller's own sha. Both are exactly
 * "the commit this pin should have been regenerated against" -- comparing against `main` specifically
 * would refuse a legitimate pre-merge dispatch against a feature branch whose pin was freshly
 * regenerated to ITS OWN head (used to corroborate a fix before it merges), since that commit is real
 * and correct but is not, and should not need to be, on `main`.
 *
 * THIS JOB CHECKS OUT a11y-witness ITSELF -- unlike the extracted `a11y` job below, which deliberately
 * does not (the whole point of a consumer-shaped gate). `check-pin` is generator-added infrastructure,
 * never something a reader copies from README.md, so rule #1 (nothing added the document doesn't give)
 * does not apply to it -- the same reasoning that already justifies `needs: [check-pin]` on the
 * extracted job and `verify-report` existing at all. `fetch-depth: 0` because the ancestor/diff checks
 * below need real history, not the single-commit shallow clone `actions/checkout` defaults to.
 *
 * @param {string} pinnedSha
 * @returns {string}
 */
function buildCheckPinJob(pinnedSha) {
  return [
    "  check-pin:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0",
    "      - name: Refuse a pin that is not an ancestor of the commit this run is executing at",
    "        run: |",
    `          if ! git merge-base --is-ancestor ${pinnedSha} "\${{ github.sha }}"; then`,
    `            echo "::error::consumer-gate.yml's uses: step is pinned to ${pinnedSha}, which is not an"`,
    `            echo "::error::ancestor of the commit this run is executing at, \${{ github.sha }} (ref"`,
    `            echo "::error::\${{ github.ref_name }}, \${{ github.event_name }}) -- regenerate (node"`,
    `            echo "::error::scripts/generate-consumer-gate.mjs) against a commit in this history"`,
    "            exit 1",
    "          fi",
    "      - name: Refuse a pin that predates a change to what it pins",
    "        run: |",
    // #939: `--no-renames`, so a rename of either pinned file out of the pathspec is not missed. Inline
    // rather than through `changed-files.mjs`: this step runs before `npm ci`, with no checkout of scripts
    // guaranteed beyond the workflow itself.
    `          changed=$(git diff --name-only --no-renames ${pinnedSha} "\${{ github.sha }}" -- README.md scripts/generate-consumer-gate.mjs)`,
    '          if [ -n "$changed" ]; then',
    `            echo "::error::consumer-gate.yml is pinned to ${pinnedSha}, but this changed since:"`,
    '            echo "::error::$changed"',
    '            echo "::error::regenerate (node scripts/generate-consumer-gate.mjs) and dispatch again"',
    "            exit 1",
    "          fi",
    "",
    "",
  ].join("\n");
}

/**
 * The job the generated workflow adds beyond what README shows -- refuses rather than passing on
 * absence when the documented workflow's own job did not succeed.
 * @param {string} jobName
 * @returns {string}
 */
function buildVerifyReportJob(jobName) {
  return [
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
    // #558: THIS USED TO ALSO REQUIRE `current === workflow` -- AN EXACT MATCH INCLUDING THE PIN -- AND
    // THAT IS STRUCTURALLY UNSATISFIABLE IN ANY COMMITTED TREE, not merely a routine staleness. Regenerate
    // at HEAD `X` and the file pins `X`; COMMIT that file and HEAD becomes the new commit `Y` (the one
    // containing the change), so the committed pin can never equal HEAD by the time anything reads it
    // back -- there is no reachable YES. Measured directly: `--check` failed on a freshly cloned `main`,
    // at `release.yml`'s own gate step, on a commit that had JUST regenerated correctly. A gate that
    // cannot pass is one people stop dispatching, so the sha half of this comparison is gone.
    //
    // The question that actually matters -- "was this pin regenerated for the commit actually running" --
    // is answered by `check-pin`, generated INTO the workflow itself (see `buildConsumerGateWorkflow`),
    // at the one moment it is answerable: dispatch, against `${{ github.sha }}`. What remains here is the
    // comparison that CAN be satisfied: does the committed file still match what README.md's documented
    // workflow produces, sha aside -- real drift (README reworded, generator changed) versus the routine
    // "HEAD moved since this was last generated" that regenerating-before-release already handles.
    /** @param {string} text */
    const stripSha = (text) => text.replaceAll(/\b[0-9a-f]{40}\b/g, "<sha>");
    if (stripSha(current) !== stripSha(workflow)) {
      console.error(`STALE  ${OUT} does not match README.md. Run: node scripts/run.mjs consumer-gate`);
      process.exitCode = 1;
      return;
    }
    console.log(`OK  ${OUT} matches README.md's documented workflow. Its sha pin will differ from HEAD `
      + "once this check itself is committed -- expected, not a drift; check-pin verifies the pin against "
      + "the commit actually running, at dispatch time.");
    return;
  }
  writeFileSync(OUT, workflow);
  console.log(`WROTE  ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
