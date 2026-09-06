// Point git at this repo's tracked hooks. Run by `prepare`, so `npm install` installs them.
//
// ## The hole this closes
//
// `core.hooksPath` was set in ONE checkout's `.git/config` and nothing put it there. No `prepare`, no
// `postinstall`, no line in CONTRIBUTING telling a clone to set it — so a fresh clone had the hook FILES
// and none of them running. Found 2026-09-05 by an external architecture audit.
//
// That matters more here than in most repos, because the pre-push hook is where the cheap tier of
// verification lives — lint, typecheck, unit tests, `check-signals`, `rules:gate`, measured at ~5 s — and
// the pre-commit hook is what stops a commit sweeping up another agent's half-finished work in a shared
// checkout, after one such commit took 19 files of which 16 were somebody else's. Both were, for anyone
// who had not manually configured them, decorative.
//
// ## Why `prepare` and not `postinstall`
//
// `prepare` runs on a plain `npm install` in a git checkout, which is the moment somebody starts working
// here. It does NOT run for a consumer installing a published package — the root manifest is private and
// is never published — so this cannot reach into anyone else's repository.
//
// ## It must never fail an install
//
// A tarball has no `.git`, CI may check out with none, and git may not be on PATH. None of those is a
// reason to break `npm install`, so every failure is REPORTED and swallowed. A silent success and a
// silent failure would be the same thing, which is the defect this file exists to fix — so it says which
// one happened, every time.
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxGitEnv } from "./git-env.mjs";

/** Relative, so it keeps working inside a `git worktree` — where `.git` is a file, not a directory. */
export const HOOKS_PATH = "scripts/git-hooks";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/** The one call shape this file makes, so the injected seam is a function and not an overload set. */
/** @type {(cmd: string, args: string[], options?: object) => unknown} */
const gitConfig = (cmd, args, options) => execFileSync(cmd, args, /** @type {any} */ (options));

/**
 * `run` is typed as the NARROW shape this function actually uses, not as `execFileSync` itself.
 *
 * Defaulting the parameter to `execFileSync` makes TypeScript infer its full overload set, and a test
 * double then has to satisfy every overload rather than the one call shape here — which is a seam that
 * only the real implementation can pass, i.e. no seam at all. The injected form is the point: this must
 * be testable without a git repository, since "no git" is one of the cases it exists to handle.
 *
 * @param {{ run?: (cmd: string, args: string[], options?: object) => unknown,
 *           exists?: (path: URL) => boolean,
 *           log?: (message: string) => void }} [deps]
 * @returns {boolean}
 */
export function installHooks({ run = gitConfig, exists = existsSync, log = console.error } = {}) {
  if (!exists(new URL(`../${HOOKS_PATH}`, import.meta.url))) {
    log(`  hooks NOT installed: ${HOOKS_PATH} is missing from this checkout.`);
    return false;
  }
  try {
    const current = String(run("git", ["config", "--get", "core.hooksPath"],
      { cwd: REPO, env: sandboxGitEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) ?? "").trim();
    if (current === HOOKS_PATH) return true;
    run("git", ["config", "core.hooksPath", HOOKS_PATH], { cwd: REPO, env: sandboxGitEnv(), stdio: "ignore" });
    log(`  git hooks installed: core.hooksPath -> ${HOOKS_PATH}`
      + (current ? ` (was ${current})` : ""));
    return true;
  } catch (unsetOrBroken) {
    // NOT swallowed: `git config --get` exits 1 when the key is UNSET, which is the normal first-run
    // case, and the retry below is what distinguishes it from a real fault -- if git is genuinely
    // broken the retry throws too and the inner catch reports THAT message. An empty `catch {}` here
    // would make "no hooks yet" and "git is missing" the same silence.
    void unsetOrBroken;
    // `git config --get` exits 1 when the key is UNSET, which is the normal first-run case rather than an
    // error — so retry the write before reporting anything.
    try {
      run("git", ["config", "core.hooksPath", HOOKS_PATH], { cwd: REPO, env: sandboxGitEnv(), stdio: "ignore" });
      log(`  git hooks installed: core.hooksPath -> ${HOOKS_PATH}`);
      return true;
    } catch (cause) {
      log(`  hooks NOT installed (${/** @type {Error} */ (cause).message}). This is not fatal — but the `
        + "pre-push gate and the shared-checkout commit guard are NOT running for you. "
        + `Set it by hand: git config core.hooksPath ${HOOKS_PATH}`);
      return false;
    }
  }
}

// NOT `file://${process.argv[1]}`: a template-literal URL does not percent-encode, so a checkout path
// containing a space makes this comparison false and `npm install` silently never installs the hooks —
// entry-points.test.ts polices exactly this idiom for every packages/*.mjs entry point, but its discovery
// only matches paths under packages/, so this scripts/ file was invisible to it. realpathSync'd for the
// same reason cli.ts's bin guard needed it: harmless here (this file is always invoked as a literal path
// by `npm run prepare`, never through a symlink), but consistent with every other entry point in this repo.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) installHooks();
