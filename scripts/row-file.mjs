#!/usr/bin/env node
// @ts-check
// command: refuse to file a backlog row via `gh issue create` when its body is missing a required section
// #735: THE SAME GATE #707 PUT ON THE CLAIM SIDE, CALLED FROM THE FILING SIDE INSTEAD.
//
// `.github/ISSUE_TEMPLATE/backlog-row.yml` marks Region, Acceptance and Open-check `required` -- but that
// is a GitHub issue FORM, and forms apply only in the web UI. Every row this fleet files goes through
// `gh issue create --body`, which bypasses the form entirely, and nobody discovered a row was incomplete
// until someone tried to claim it (#707). Measured 2026-09-09 (worker-capture, #735):
//
//   open rows examined: 76
//   missing at least one required section: 36
//     missing Region: 25 | Acceptance: 5 | Open-check: 28
//
//   #0-399    8 of 36 (22%)
//   #400-599  9 of 11 (82%)
//   #600-699  10 of 18 (56%)
//   #700+     9 of 11 (82%)   <- of the eleven newest, exactly two carried all three
//
// The rate rises with recency because the more the org files its own work with `gh issue create`, the
// more of the backlog becomes un-claimable -- the web form's enforcement never runs against that path.
//
// ceo's ruling: refuse at FILING, not only at claiming, so the cost lands on whoever holds the context,
// not on whoever picks the row up later. In worker-capture's own words, filing #677 without this:
//
//   "I wrote #677's Open-check myself and I am not confident it is the one `orchestrator` would have
//   written."
//
// NOT A SECOND IMPLEMENTATION. `missingTemplateFields` is #707's own pure function, imported from
// `row-claim/template-fields-rule.mjs` unchanged -- the identical rule row-claim already enforces at
// claim time, asked here one step earlier. A body that would pass this refuses nothing later, and a body
// that would fail `row-claim claim` cannot be filed in the first place.
//
// DELIBERATELY NO `refuseUnknownFlags` HERE. Every other CLI in this tree owns its own small, fixed flag
// surface and refuses anything else (#419's whole point). This one wraps an EXTERNAL tool with a large,
// evolving flag surface (`gh issue create --help` lists title, body, label, assignee, milestone, project,
// template, editor, web, ...) that this script has no business enumerating or falling behind on. Its job
// is exactly one thing -- read the body this invocation would file and check it before `gh` ever runs --
// and every other argument passes through unexamined and unchanged.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { missingTemplateFields } from "./row-claim/template-fields-rule.mjs";

/**
 * The body text THIS invocation would file, read from its own argv exactly the way `gh issue create`
 * itself would: `--body <text>`, `--body=<text>`, `--body-file <path>`, or `--body-file=<path>`. `null`
 * when none of the four forms is present -- this tool has nothing to check, and says so rather than
 * guessing or letting `gh` file an unchecked body.
 *
 * A `--body-file` value of `-` (gh's own convention for "read stdin") is read as `null` rather than as a
 * literal filename: this wrapper runs synchronously and has no stdin capture of its own, and misreading
 * `-` as a path would throw `ENOENT` on a caller doing exactly what `gh`'s own docs describe.
 *
 * @param {string[]} argv
 * @returns {string | null}
 */
export function bodyFromArgv(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--body") return argv[i + 1] ?? null;
    if (arg.startsWith("--body=")) return arg.slice("--body=".length);
    if (arg === "--body-file") {
      const path = argv[i + 1];
      if (!path || path === "-") return null;
      return readFileSync(path, "utf8");
    }
    if (arg.startsWith("--body-file=")) {
      const path = arg.slice("--body-file=".length);
      if (path === "-") return null;
      return readFileSync(path, "utf8");
    }
  }
  return null;
}

/**
 * THE VERDICT, PURE -- `null` means proceed. Reuses #707's `missingTemplateFields` outright rather than
 * re-deriving it; see this file's header for why that matters here specifically.
 * @param {string | null} body
 * @returns {string | null}
 */
export function fileRefusalReason(body) {
  if (body === null) {
    return "row-file: no --body or --body-file (or --body-file -) found in these arguments -- this tool "
      + "cannot check a body it cannot read, so it refuses rather than filing one unchecked. Pass one of "
      + "them so the three required sections (Region, Acceptance, Open-check) can be checked before this "
      + "reaches GitHub.";
  }
  const missing = missingTemplateFields(body);
  if (missing.length === 0) return null;
  return `row-file: REFUSING to file -- missing ${missing.join(", ")}. The issue template requires all `
    + "three (Region, Acceptance, Open-check) but the web form that enforces that does not apply to "
    + "`gh issue create`. Add the missing section(s) as a `## <Field>` heading with real content under "
    + "it, then file again -- whoever claims this row later has less context than you have right now.";
}

/**
 * Every argument, unchanged, straight to the real `gh issue create`.
 * @param {string[]} argv
 */
function spawnGhIssueCreate(argv) {
  execFileSync("gh", ["issue", "create", ...argv], { stdio: "inherit" });
}

/**
 * Checks, then (only if it passes) files -- injectable `spawnGh` so a test can prove the passthrough
 * happens, and happens with the EXACT argv given, without spawning a real `gh` or reaching GitHub. This
 * wrapper adds exactly one check and must not otherwise alter what gets filed or how `gh` itself behaves.
 * @param {string[]} argv
 * @param {{ spawnGh?: (argv: string[]) => void }} [deps]
 * @returns {number} the process exit code
 */
export function createIssue(argv, { spawnGh = spawnGhIssueCreate } = {}) {
  const reason = fileRefusalReason(bodyFromArgv(argv));
  if (reason) {
    process.stderr.write(`${reason}\n`);
    return 1;
  }
  try {
    spawnGh(argv);
    return 0;
  } catch (error) {
    return /** @type {{ status?: number }} */ (error).status ?? 1;
  }
}

function main() {
  process.exitCode = createIssue(process.argv.slice(2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
