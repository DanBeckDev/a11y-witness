#!/usr/bin/env node
// MUTATION CHECKING, AS A COMMAND RATHER THAN A SEQUENCE PEOPLE TYPE.
//
// This repository relies on mutation checking more than on any other technique: almost every guard here
// is trusted because somebody broke the thing it watches and saw it fail. The sequence is five steps and
// every one of them has been got wrong in this repo, twice on 2026-09-06 alone:
//
//   1. RUN THE TEST FIRST. A mutation check against an already-red test tells you nothing, and a mutation
//      check against a test that passes VACUOUSLY tells you less than nothing.
//   2. COPY THE FILE ASIDE. `git checkout -- <file>` restores it to HEAD, silently discarding every
//      uncommitted change in it and not only the mutation. CLAUDE.md names that command because it once
//      destroyed release-eligible model weights; it destroyed two board-report fixes on 2026-09-06,
//      mid-mutation-check, which is the exact workflow the rule exists for.
//   3. PROVE THE MUTATION LANDED. A shell-quoting slip makes the edit a no-op, the test then passes, and
//      the passing test reads as "the guard does not bite" when it means "nothing was broken". That
//      happened here: a `python3 -c` replacement was mangled by the shell and reported a working guard as
//      broken.
//   4. THE TEST MUST FAIL. If it passes, SUSPECT THE GUARD BEFORE THE CODE. Two guards shipped green
//      against the very defect they were written for on 2026-09-06 -- one read the whole document where
//      it meant to read one section, and its `some()` was satisfied by a correct line sitting beside the
//      broken one.
//   5. RESTORE, AND RUN AGAIN. The re-run proves the restore worked, rather than that `cp` exited zero.
//
// Usage:
//   npm run mutate -- --file=<path> --mutate='<shell that edits the file>' --test='<shell>'
//
// THE LIMIT OF EXIT 0, AND IT IS THE ONE THING THIS TOOL CANNOT CHECK FOR YOU.
//
// This script observes that the test command exited NONZERO while the file was mutated. It cannot observe
// WHY. A mutation that breaks the build, mistypes an import, or trips an unrelated assertion produces the
// identical red, and the report then says THE GUARD BITES about a guard that was never consulted. That is
// step 4's warning ("suspect the guard before the code") pointed at this tool rather than at the test, and
// it is the #51 lesson -- a forced-1ms mutation that failed for the wrong reason and nearly certified a
// false pass -- reappearing inside the instrument built to prevent it.
//
// So for any mutation whose expected failure is SPECIFIC -- a named assertion, a particular skip, a
// message you predicted -- run it once by hand as well (`cp` aside, mutate, run, READ THE OUTPUT, `cp`
// back, `cmp`) and confirm the red says what you predicted. Measured 2026-09-06 on the corpus-guard
// wiring: the expected result was the test being SKIPPED with `skipped: a capture is writing runs/`, and
// only reading the output distinguished that from a compile error wearing the same exit code.
//
// Exit codes are the contract:
//   0  the guard BITES -- passed clean, failed mutated, passed restored. See the limit above: this means
//      the suite went red, NOT that it went red for the reason you mutated
//   1  the guard DID NOT BITE -- it passed while the code was broken
//   2  refused before mutating -- the test was already failing, or the arguments are unusable
//   3  THE RESTORE FAILED -- the file on disk is not what it was. Loud, and the copy is left in place.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, mkdtempSync } from "node:fs";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { sandboxGitEnv } from "./git-env.mjs";

const EXIT = { BITES: 0, DID_NOT_BITE: 1, REFUSED: 2, RESTORE_FAILED: 3 };

const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Run a shell command, returning whether it succeeded and its combined output.
 *
 * `GIT_*` is scrubbed: a mutation check is most often run from a hook or a test harness, and a leaked
 * `GIT_DIR` makes any git the command reaches operate on a different repository. */
function run(command) {
  try {
    const out = execSync(command, { encoding: "utf8", stdio: "pipe", env: sandboxGitEnv() });
    return { ok: true, out };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function refuse(message) {
  console.error(`REFUSING: ${message}`);
  process.exit(EXIT.REFUSED);
}

function main() {
  refuseUnknownFlags(["--file", "--mutate", "--test", "--keep"],
    { entry: import.meta.url, command: "npm run mutate" });
  const argv = process.argv.slice(2);
  const flag = (name) => argv.find((a) => a.startsWith(`${name}=`))?.split("=").slice(1).join("=");

  const file = flag("--file");
  const mutate = flag("--mutate");
  const test = flag("--test");
  if (!file || !mutate || !test) {
    refuse("this needs --file=<path> --mutate='<shell that edits it>' --test='<shell>'.\n"
      + "  Example:\n"
      + "    npm run mutate -- --file=src/rules.ts \\\n"
      + "      --mutate=\"sed -i '' 's/>= 3/>= 99/' src/rules.ts\" \\\n"
      + "      --test='npx tsx --test src/rules.test.ts'");
  }
  if (!existsSync(file)) refuse(`${file} does not exist.`);

  // 1. THE TEST MUST PASS FIRST.
  const before = run(test);
  if (!before.ok) {
    refuse(`the test is ALREADY FAILING before anything was mutated, so this check would prove nothing.\n`
      + `Fix or identify that first. Nothing was touched.\n\n${before.out.trim().slice(-2000)}`);
  }

  // 2. COPY ASIDE, never `git checkout --`.
  const stash = path.join(mkdtempSync(path.join(tmpdir(), "mutate-")), path.basename(file));
  copyFileSync(file, stash);
  const original = digest(file);
  console.log(`clean:    test PASSES. ${file} copied to ${stash}`);

  const applied = run(mutate);
  const mutated = digest(file);
  let verdict;

  try {
    // 3. THE MUTATION MUST HAVE LANDED.
    if (mutated === original) {
      console.error(`\nREFUSING: the mutation command changed nothing -- ${file} is byte-identical.\n`
        + "A no-op edit makes the test pass for the wrong reason, and that passing test reads as "
        + "'the guard does not bite'.\n"
        + "Check the quoting; a shell-mangled replacement is the usual cause.\n"
        + (applied.ok ? "" : `\nThe mutation command itself failed:\n${applied.out.trim().slice(-1000)}`));
      verdict = EXIT.REFUSED;
    } else {
      // 4. THE TEST MUST NOW FAIL.
      const during = run(test);
      if (during.ok) {
        console.error("\nTHE GUARD DID NOT BITE. The code is broken and the test still passes.\n"
          + "SUSPECT THE GUARD BEFORE THE CODE: is it asserting on the half you changed, is its "
          + "`some()` satisfied by a neighbour, is it reading a built copy rather than the source?");
        verdict = EXIT.DID_NOT_BITE;
      } else {
        console.log("mutated:  test FAILS, as it must. First lines of why:\n"
          + during.out.trim().split("\n").slice(0, 6).map((l) => `  ${l}`).join("\n"));
        verdict = EXIT.BITES;
      }
    }
  } finally {
    // 5. RESTORE, AND PROVE IT -- both by bytes and by running the test again.
    copyFileSync(stash, file);
    if (digest(file) !== original) {
      console.error(`\nTHE RESTORE FAILED. ${file} is not what it was. The copy is at ${stash} and has `
        + "NOT been deleted. Restore it by hand before doing anything else.");
      process.exit(EXIT.RESTORE_FAILED);
    }
    const after = run(test);
    if (!after.ok) {
      console.error(`\nTHE FILE IS RESTORED BYTE FOR BYTE AND THE TEST NOW FAILS ANYWAY. Something the `
        + "mutation command touched is outside --file: a build output, a second source file, a cache.\n"
        + `The copy is at ${stash}.\n\n${after.out.trim().slice(-2000)}`);
      process.exit(EXIT.RESTORE_FAILED);
    }
    console.log(`restored: ${file} is byte-identical and the test PASSES again.`);
  }

  if (verdict === EXIT.BITES) console.log("\nTHE GUARD BITES.");
  process.exit(verdict);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
