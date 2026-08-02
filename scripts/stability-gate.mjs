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
  const args = ["src/training/repeat-capture.mjs", `--url=${url}`, `--times=${TIMES}`];
  if (WORKER) args.push(`--worker=${WORKER}`);
  try {
    const { stdout } = await run("node", args, { maxBuffer: 1 << 24 });
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
    results.push({ path, ok: false, detail: error.message.split("\n")[0] });
    process.stdout.write(`  FAILED — ${error.message.split("\n")[0]}\n`);
  }
}

const failed = results.filter((r) => !r.ok);
process.stdout.write(`\n${results.length - failed.length}/${results.length} canaries stable\n`);
for (const f of failed) process.stdout.write(`  ${f.path}: ${f.detail}\n`);
if (failed.length) {
  process.stdout.write("\nDo NOT start a corpus run. Evidence that varies for the same unchanged page " +
    "is indistinguishable from evidence that differs because the page differs, which is the one defect " +
    "this project cannot tolerate.\n");
  process.exit(1);
}
process.stdout.write("\nStable. Safe to start a corpus run.\n");
