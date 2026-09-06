#!/usr/bin/env node
// IS THE FIRST-PUBLISH NPM TOKEN STILL THERE AFTER IT SHOULD BE GONE? — #73, built alongside #72.
//
//   npm run npm-token:check            say whether NPM_TOKEN is gone, present, or unaskable
//   npm run npm-token:check -- --post  and comment ONCE on the tracking issue if it is a real finding
//
// ## Why this is dated, and why the date does almost no work
//
// `NPM_TOKEN` is an organisation-level Actions secret on `github.com/a11ign`, created 2026-09-06 to cover
// exactly one thing: the first `npm publish` of packages that cannot yet have a trusted publisher attached,
// because npm's own docs do not say whether one can be configured before a package exists (#72). It expires
// 2026-12-05. #73 asks whether it is gone on 2026-11-20, fifteen days early on purpose — late enough that
// the first publish and the trusted-publisher configuration should both be long done, early enough that a
// "still there" finding leaves two weeks to act before the expiry becomes an outage rather than a decision.
//
// ## Why this runs on PUSH, never on a schedule — the same reason as `board-schedule-liveness.mjs`
//
// A watchdog that is itself scheduled has the disease it watches for: GitHub disables a scheduled workflow
// after 60 days without repository activity, silently, and this repo already paid once to learn that a
// third cron dies in the same breath as the two it guards. `push` cannot be disabled by inactivity, because
// a push IS the activity -- the one condition that would silence a schedule is the one condition where this
// check's silence is also correct (nobody has touched the repo, so nobody has re-created a stray token
// either). `npm-token-liveness.test.ts` pins the absence of a `schedule:` key in the workflow for the same
// reason `board-liveness.test.ts` does.
//
// ## The third state is not decoration -- it is why this script exists at all
//
// `gh secret list --org <org>` needs org-admin or a fine-grained "Organization secrets: read" permission.
// The repository's default `GITHUB_TOKEN` has neither, so most runs of this check -- including, honestly,
// most runs BEFORE a human deliberately grants a scoped read credential -- will not be able to ask the
// question at all. Reading that failure as "absent" would report an unrevoked token as fine on the strength
// of a permissions error; reading it as "present" would raise a false alarm on every ordinary push. Neither
// is honest, so a failed ask is its own state, `CANNOT_TELL`, silent before the due date and loud after it
// -- the same shape #59's `mergeStatus()` uses for a `merge-base` that could not even ask the question, and
// the same reason `evidence:check` has an INCONCLUSIVE exit distinct from both SAME and CHANGED.
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { REPO, gh } from "./board-data.mjs";

const ISSUE = "73";
const ORG = "a11ign";
const SECRET_NAME = "NPM_TOKEN";

/** 2026-11-20, per #73 -- fifteen days before the token's 2026-12-05 expiry. */
export const DUE_DATE = "2026-11-20";

/** Exit codes. CANNOT_TELL is not a lesser ALIVE -- see the header. */
export const EXIT = { ALIVE: 0, STOPPED: 1, CANNOT_TELL: 2 };

/**
 * The verdict, pure -- so the one case nobody can arrange on demand (a token still present in November)
 * can still be exercised today, with a synthetic clock. The IO around it (asking GitHub, posting once) is
 * in `main`.
 *
 * @param {{ today: string, present: boolean | "unknown" }} options `today` as `YYYY-MM-DD`.
 * @returns {{ code: number, headline: string, detail: string }}
 */
export function tokenLivenessVerdict({ today, present }) {
  const due = today >= DUE_DATE;

  if (present === "unknown") {
    if (!due) {
      return { code: EXIT.ALIVE,
        headline: `could not ask whether ${SECRET_NAME} still exists, and it is not due to be gone yet`,
        detail: `(due ${DUE_DATE}). This is expected before a human grants a scoped read credential -- `
          + "see docs/publish-blocker.md -- and is not itself a finding while the deadline has not passed." };
    }
    return { code: EXIT.CANNOT_TELL,
      headline: `PAST DUE (${DUE_DATE}) and could not ask whether ${SECRET_NAME} still exists`,
      detail: "reading 'could not ask' as 'must be gone' is exactly the collapse this check exists to "
        + `refuse. Someone with org-admin on ${ORG} must run \`gh secret list --org ${ORG}\` by hand and `
        + "say which of the three cases in #73 this is." };
  }

  if (present) {
    if (!due) {
      return { code: EXIT.ALIVE,
        headline: `${SECRET_NAME} is still present, and it is not due to be gone yet`,
        detail: `(due ${DUE_DATE}). It exists to cover the first publish -- see #72 -- so this is expected `
          + "until then." };
    }
    return { code: EXIT.STOPPED,
      headline: `PAST DUE (${DUE_DATE}) and ${SECRET_NAME} is STILL PRESENT`,
      detail: "one of three things, and each needs a different response (do not simply delete it -- "
        + "which one it is decides whether anything else is broken):\n"
        + "  1. trusted publishing was never configured, so this token is still the live publish path and "
        + "its 2026-12-05 expiry is a real outage bearing down\n"
        + "  2. it was configured and the token was left behind -- a standing credential nobody needs\n"
        + "  3. nobody looked\n"
        + "Say which, on #73, before revoking anything." };
  }

  return { code: EXIT.ALIVE, headline: `${SECRET_NAME} is gone`, detail: "" };
}

/** `true`/`false` when the ask succeeded, `"unknown"` when it could not be asked at all. */
function secretPresent(org, name) {
  let out;
  try {
    out = gh(["secret", "list", "--org", org, "--json", "name"]);
  } catch {
    // 403 without org-admin or a scoped read credential is the expected shape, not a surprise -- see the
    // header. A network blip lands here too, and both must read the same way: unaskable, not "gone".
    return "unknown";
  }
  return JSON.parse(out).some((/** @type {{name: string}} */ s) => s.name === name);
}

/** One comment per spell, not one per push. A warning that repeats is a warning people filter. */
function postOnce(issue, verdict) {
  const marker = `${SECRET_NAME} liveness: ${verdict.headline}`;
  const existing = gh(["issue", "view", issue, "--repo", REPO, "--json", "comments", "--jq",
    ".comments[].body"]);
  if (existing.includes(marker)) {
    console.error("(already reported for this spell; not commenting again)");
    return;
  }
  gh(["issue", "comment", issue, "--repo", REPO, "--body",
    `**${marker}**\n\n${verdict.detail}\n\n---\n\nReported by \`npm run npm-token:check\`, which runs on `
    + "push rather than on a schedule: a watchdog that is itself scheduled is disabled by the same "
    + "inactivity it exists to detect."]);
}

function main() {
  refuseUnknownFlags(["--post", "--issue"],
    { entry: import.meta.url, command: "npm run npm-token:check" });
  const argv = process.argv.slice(2);
  const issue = argv.find((a) => a.startsWith("--issue="))?.split("=")[1] ?? ISSUE;

  const present = secretPresent(ORG, SECRET_NAME);
  const today = new Date().toISOString().slice(0, 10);
  const verdict = tokenLivenessVerdict({ today, present });

  const say = verdict.code === EXIT.ALIVE ? console.log : console.error;
  say(`${verdict.headline}${verdict.detail ? `\n  ${verdict.detail}` : ""}`);
  if (verdict.code !== EXIT.ALIVE && argv.includes("--post")) postOnce(issue, verdict);
  process.exit(verdict.code);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
