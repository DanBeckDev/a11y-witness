/**
 * Every program this repo tells someone to run must actually be IN the repo.
 *
 * `scripts/score-screenreader-model.py` — the default judge backend — was never committed. It lived in one
 * working tree and in two unreachable `kanban checkpoint` commits, was not gitignored, and was referenced
 * by `package.json` the whole time. So `npm run eval`, `eval:gate` and the GitHub Action's default
 * `judge-backend: local` all worked here and could not work anywhere else.
 * `scripts/check-screenreader-hardening.py` was missing the same way.
 *
 * ## Why nothing caught it
 *
 * **`npm pack` includes untracked files.** A tarball built on a machine that has the file contains it, so
 * "I installed it and it worked" is not evidence, and neither is any check that begins from this checkout.
 * Only tracked-ness answers the question, which is what this test asserts.
 *
 * It needs no worker, no venv, no network — so it runs in CI, which is the one place that sees a clean
 * checkout and would have failed immediately.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Anything shaped like a path into `scripts/`, wherever it appears in the file. */
const SCRIPT_PATH = /scripts\/[A-Za-z0-9._-]+\.(?:mjs|js|ts|py|ps1|sh)/g;

function referencedScripts(): Map<string, string[]> {
  const sources = ["package.json", "action.yml"];
  const found = new Map<string, string[]>();
  for (const source of sources) {
    for (const match of readFileSync(source, "utf8").matchAll(SCRIPT_PATH)) {
      const list = found.get(match[0]) ?? [];
      if (!list.includes(source)) list.push(source);
      found.set(match[0], list);
    }
  }
  return found;
}

/**
 * Is there a git repository to ask?
 *
 * Without this the test reported ALL 17 referenced programs as missing when run from an exported tree with
 * no `.git` — every `git ls-files` fails, and "the command failed" is indistinguishable from "the file is
 * untracked". A guard that cries wolf outside a checkout is worse than no guard: it gets deleted. So an
 * absent repository is reported as SKIPPED, loudly, in the same spirit as `verify.corpus.test.ts` skipping
 * when the corpus is absent. CI runs `actions/checkout`, which provides `.git`, so the check still runs
 * exactly where it matters.
 */
function insideGitRepo(): boolean {
  try {
    return execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).trim() === "true";
  } catch {
    return false;
  }
}

const isTracked = (path: string): boolean => {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", path], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

test("every scripts/ program referenced by package.json or action.yml is tracked in git", (t) => {
  if (!insideGitRepo()) {
    t.skip("not a git checkout, so tracked-ness cannot be determined here");
    return;
  }
  const referenced = referencedScripts();
  // Guard the guard: if the regexes stop matching, this test would pass by examining nothing — the exact
  // failure mode this project keeps meeting. The repo references well over a dozen.
  assert.ok(referenced.size >= 10, `only found ${referenced.size} referenced scripts; the scan is broken`);

  const missing = [...referenced.entries()]
    .filter(([path]) => !isTracked(path))
    .map(([path, sources]) => `${path} (referenced by ${sources.join(", ")})`);

  assert.deepEqual(missing, [],
    `${missing.length} referenced program(s) are not in the repo. Anyone who clones or installs this cannot `
    + `run them, however well they work on the machine that has them.`);
});
