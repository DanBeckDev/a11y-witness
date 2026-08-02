// Refuse to start a corpus run if the pipeline does not produce the same evidence twice.
//
//   npm run gate:stability                       # before any recapture
//   npm run gate:stability -- --times=6
//
// ## Why this is a gate and not a tool
//
// The corpus carried a non-deterministic artefact for weeks and nothing caught it. Edge's autofill
// drew a suggestion icon inside recognised inputs, NVDA announced it as an embedded object appended to
// the field, and because `probeForms` submits forms the profile learned more as a run progressed --
// so the rate climbed from 3% to 31% and 26 good/bad pairs ended up disagreeing about it.
//
// Every existing check stayed green throughout, because they count. The counts never moved: one form
// field before, one form field after. Only comparing CONTENT across repeated captures of the same
// unchanged page could have seen it, and that was an ad-hoc tool nobody was required to run.
//
// ## Why these pages
//
// A canary that cannot express the fault is worthless, and choosing one that could not is a mistake
// made three times in a single day here -- each time producing a clean result that was read as
// confirmation. Every page below is present because of a specific mechanism it can exercise, and that
// reason is recorded next to it. Add pages the same way.
//
// This delegates to `training:repeat` rather than reimplementing its comparison, which is the same
// point in miniature: the tool already existed and hand-rolled substitutes were worse.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const BASE = arg("base", "http://192.168.64.1:5050");
const TIMES = Number(arg("times", "5"));
const WORKER = arg("worker", process.env.A11Y_WORKER);

/**
 * Canaries, each with the mechanism it exists to catch.
 *
 * `reason` is not documentation. It is the thing to check before trusting a PASS: if a page cannot
 * express the fault you care about, its stability tells you nothing about that fault.
 */
const CANARIES = [
  {
    path: "form-unlabelled/good",
    reason: "auto-focuses its input, which is what surfaces Edge's autofill affordance — the exact " +
      "page that still produced U+FFFC after a fix verified on a page that does not auto-focus",
  },
  {
    path: "form-error-silent/bad",
    reason: "submits a form, which is how the profile LEARNS the values that later become suggestions",
  },
  {
    path: "table-unassociated-headers/bad",
    reason: "the table walk returned 4, 2, 4, 4, 1, 4, 4 cells across 18 captures once; tables are " +
      "the other field with a history of non-determinism",
  },
  {
    path: "disclosure-state-silent/good",
    reason: "state changes depend on an interaction landing, which is timing-sensitive in a way a " +
      "static read is not",
  },
  {
    path: "image-missing-alt/good",
    reason: "the simplest page there is — if this one varies, the fault is in the pipeline rather " +
      "than in anything the page does",
  },
];

const results = [];
for (const { path, reason } of CANARIES) {
  const url = `${BASE}/${path}`;
  process.stdout.write(`\n=== ${path} (${TIMES}x) ===\n    why: ${reason}\n`);
  // tsx, not node: repeat-capture imports isTransient from capture-decisions.mjs, which imports the
  // TypeScript verify.js. Under plain node that is ERR_MODULE_NOT_FOUND before a single line of output
  // -- which is precisely how five canaries came back "Command failed" with nothing to read. The repo
  // has hit this before with evidence-check.mjs; the fix there was the same.
  const args = ["src/training/repeat-capture.mjs", `--url=${url}`, `--times=${TIMES}`];
  if (WORKER) args.push(`--worker=${WORKER}`);
  try {
    const { stdout } = await run("npx", ["tsx", ...args], { maxBuffer: 1 << 24 });
    const varies = stdout.split("\n").filter((l) => l.includes("VARIES"));
    const usable = /(\d+)\/\d+ usable/.exec(stdout)?.[1];
    if (varies.length) {
      results.push({ path, ok: false, detail: varies.map((v) => v.trim()).join("; ") });
      process.stdout.write(varies.map((v) => `  ${v.trim()}\n`).join(""));
    } else if (Number(usable ?? 0) < 2) {
      // Too few usable captures is not a PASS. A gate that passes when it could not measure is worse
      // than no gate, because it launders "unknown" into "fine".
      results.push({ path, ok: false, detail: `only ${usable ?? 0} usable capture(s) — could not judge` });
      process.stdout.write(`  INCONCLUSIVE — only ${usable ?? 0} usable\n`);
    } else {
      results.push({ path, ok: true, detail: `${usable} usable, all fields identical` });
      process.stdout.write(`  STABLE — ${usable} usable, all fields identical\n`);
    }
  } catch (error) {
    // repeat-capture exits non-zero for THREE different reasons -- a field varies, a capture errored,
    // or a capture came back empty -- and they need different responses. Collapsing them into
    // "Command failed" made a transient capture error read exactly like genuine instability, and cost
    // a re-run to discover the page was fine. Its output is on stdout even when it exits 1, so keep it.
    const out = String(error.stdout ?? "");
    const varies = out.split("\n").filter((l) => l.includes("VARIES")).map((l) => l.trim());
    const empty = /(\d+) capture\(s\) heard nothing/.exec(out)?.[1];
    const failedRuns = out.split("\n").filter((l) => l.trim().startsWith("FAILED")).map((l) => l.trim());
    // An empty stdout means the child never started -- a module resolution error, a missing file --
    // and that is a broken harness, not an inconclusive measurement. Say so rather than advising a
    // re-run that will fail identically.
    if (!out.trim()) {
      const detail = `harness did not start: ${String(error.stderr ?? error.message).split("\n").find((l) => l.includes("Error")) ?? error.message.split("\n")[0]}`;
      results.push({ path, ok: false, unstable: false, detail });
      process.stdout.write(`  BROKEN — ${detail}\n`);
      continue;
    }
    const detail = varies.length ? `UNSTABLE: ${varies.join("; ")}`
      : empty ? `${empty} empty capture(s) — the foreground flake, not instability`
      : failedRuns.length ? `${failedRuns.length} capture(s) errored: ${failedRuns[0]}`
      : error.message.split("\n")[0];
    // Only a VARIES is evidence the pipeline is nondeterministic. An errored or empty capture is a
    // flake in the run, so it is reported and retried rather than treated as a verdict.
    results.push({ path, ok: false, unstable: varies.length > 0, detail });
    process.stdout.write(`  ${varies.length ? "UNSTABLE" : "INCONCLUSIVE"} — ${detail}\n`);
  }
}

const failed = results.filter((r) => !r.ok);
process.stdout.write(`\n${results.length - failed.length}/${results.length} canaries stable\n`);
for (const f of failed) process.stdout.write(`  ${f.path}: ${f.detail}\n`);
const unstable = failed.filter((f) => f.unstable);
if (failed.length && !unstable.length) {
  process.stdout.write("\nNo canary was UNSTABLE, but some could not be judged (errored or empty " +
    "captures). Re-run the gate; if the same canary keeps failing to complete, that is a worker " +
    "problem rather than a determinism one.\n");
  process.exit(2);
}
if (failed.length) {
  process.stdout.write("\nDo NOT start a corpus run. Evidence that varies for the same unchanged page " +
    "is indistinguishable from evidence that differs because the page differs, which is the one defect " +
    "this project cannot tolerate.\n");
  process.exit(1);
}
process.stdout.write("\nStable. Safe to start a corpus run.\n");
