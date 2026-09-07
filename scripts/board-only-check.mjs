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
import { filesChangedAgainstOrigin } from "./changed-packages.mjs";
import { boardOnly, DOC_ROOT_FILES } from "./ci-changed.mjs";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";

export function isBoardOnlyDiff(files) {
  const docsFiles = files.filter((f) => f.startsWith("docs/") || DOC_ROOT_FILES.has(f));
  return docsFiles.length > 0 && boardOnly(docsFiles);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Guarded per #164: takes no flags; it decides whether a change is board-only.
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/board-only-check.mjs" });
  process.stdout.write(String(isBoardOnlyDiff(filesChangedAgainstOrigin())));
}
