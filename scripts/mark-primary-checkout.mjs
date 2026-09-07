// MARK THIS CHECKOUT AS THE FLEET-DRIVING ONE — the opt-in the hooks read.
//
//   node scripts/mark-primary-checkout.mjs           # is it marked?
//   node scripts/mark-primary-checkout.mjs --set     # mark it
//   node scripts/mark-primary-checkout.mjs --unset   # stop treating this checkout as the primary
//
// `pre-commit` and `post-checkout` guard the checkout the fleet is driven from: nothing may be committed
// there and it may only sit detached at `origin/main`, because `assertFleetRunsThisCheckout` hashes the
// working tree and every worktree's `node_modules` resolves through the primary's `dist`.
//
// Until #198 they identified it by `.git` being a directory, which is true of EVERY clone — so the hook
// travelled to the lab with a `git pull` and broke every `lab:job -e ref=<branch>`. The mark lives in
// `git config --local`, i.e. `.git/config`, which is **not cloned and not pulled**: that is the whole
// property, and it is why this is a command rather than a file in the tree.
//
// Setting it is a decision about ONE machine, so it is a deliberate act rather than something provisioning
// infers. `npm run doctor` reports an unmarked checkout, because "unmarked" and "safe" must not read the
// same — a guard nobody has switched on is the check-that-examined-nothing shape one layer down.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";

const KEY = "a11y.primaryCheckout";

/** Whether this checkout carries the mark. Absent config is `false`, never an error. */
export function isMarked() {
  try {
    return execFileSync("git", ["config", "--local", "--get", KEY], { encoding: "utf8" }).trim() === "true";
  } catch {
    // `git config --get` exits 1 when the key is absent, which is the common case and not a failure.
    return false;
  }
}

function main() {
  refuseUnknownFlags(["--set", "--unset"], { entry: import.meta.url, command: "mark-primary-checkout" });
  const set = process.argv.includes("--set");
  const unset = process.argv.includes("--unset");
  if (set && unset) {
    process.stderr.write("mark-primary-checkout: --set and --unset together say nothing. Pick one.\n");
    process.exit(2);
  }
  if (set) execFileSync("git", ["config", "--local", KEY, "true"]);
  // `--unset` on an absent key exits 5; that is "already not marked", which is the state being asked for.
  if (unset) try { execFileSync("git", ["config", "--local", "--unset", KEY]); } catch { /* already unset */ }

  const marked = isMarked();
  process.stdout.write(marked
    ? `This checkout IS marked as the primary (${KEY}=true).\n`
      + "  `pre-commit` refuses commits here and `post-checkout` keeps it detached at origin/main.\n"
    : `This checkout is NOT marked as the primary (${KEY} unset).\n`
      + "  The primary-checkout guards are INERT here. That is correct for a worktree, the lab, a worker\n"
      + "  or a colleague's clone — and wrong for the machine that drives the fleet.\n"
      + "  Mark it with:  npm run primary:mark -- --set\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
