#!/usr/bin/env node
// IS THIS BRANCH'S DIFF, AGAINST origin/main, A BOARD-ONLY DIFF? -- the pre-push hook's board-only fast
// path asks this exact question, and it must ask it the SAME WAY `ci.yml`'s `board` job does (via
// `ci-changed.mjs`'s `boardOnly`), never a second copy of the two regexes. Prints "true" or "false" to
// stdout; nothing else, so the hook's `$(...)` capture stays a one-line comparison.
//
// A SEPARATE FILE RATHER THAN AN INLINE `node -e` IN THE HOOK -- the first version of this was a one-line
// `node -e` embedded in bash, with escaped quotes and escaped `&&`, unreadable and untestable. This is
// three lines of real logic, reusing `filesChangedAgainstOrigin` and `boardOnly` exactly as `ci.yml`'s own
// `changed` job's classification does, and it has its own test like every other script here.
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { filesChangedAgainstOrigin } from "./changed-packages.mjs";
import { boardOnly } from "./ci-changed.mjs";

// #296: THE WHOLE DIFF, NOT JUST ITS docs/ SUBSET -- this used to filter to doc-touching files first and
// ask `boardOnly` about only those, so a diff mixing `docs/board/reported.json` with a Node script (or
// anything else outside `docs/`) reduced to the one docs file, which passed `boardOnly` on its own and
// took the fast path -- skipping lint, typecheck and the general suite for a script `ci.yml`'s own `board`
// job never lints either (see the pre-push hook's own comment on that job). `boardOnly` already requires
// EVERY member of its input to be a board file, so passing it the unfiltered diff is the fix: a diff of
// board files alone still passes, and one member outside that set fails it, whatever kind of file it is.
export function isBoardOnlyDiff(files) {
  return files.length > 0 && boardOnly(files);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  process.stdout.write(String(isBoardOnlyDiff(filesChangedAgainstOrigin())));
}
