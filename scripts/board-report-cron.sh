#!/bin/bash
# What launchd actually runs. A wrapper rather than the node call directly, so that a REFUSAL is recorded
# with its reason and its exit code instead of vanishing into a log with no context.
#
# NEVER PIPE THE COMMAND WHOSE EXIT STATUS DECIDES THE OUTCOME. This project has been bitten by `| tail`
# reporting a failed pipeline as success, and by `; echo "EXIT=$?"` making the compound status the echo's.
# So: run it, capture the status immediately into a variable, and branch on the variable.
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1

printf '\n===== %s  board report =====\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# THE BRANCH IS CHECKED AT RUN TIME, NOT ONLY AT INSTALL TIME, and that is the half that matters.
#
# Checking at install time catches installing from a feature branch. It does NOT catch the real case: the
# tree is checked out to a branch AFTER the job is installed -- which is ordinary here, several agents
# move this checkout daily -- and the 08:00 job then renders from whatever is checked out at 08:00. An
# install-time check would have reported success and published the wrong document anyway.
BRANCH="$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR \
  git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
printf 'checkout is on %s\n' "$BRANCH"
if [ "$BRANCH" != "main" ]; then
  printf 'NOT POSTED: this checkout is on %s, not main, so the edition would come from that branch.\n' \
    "$BRANCH"
  printf 'Nothing was published. Check out main, or re-run by hand once the tree is back.\n'
  exit 2
fi

# ONE RUN PRODUCES BOTH, so the GitHub edition and the PDF cannot disagree. They already share a data
# layer; running them from one invocation closes the other half -- two invocations minutes apart would
# read GitHub twice and could straddle a merge.
out=$(node scripts/board-report.mjs --post --issue=20 2>&1)
status=$?
printf '%s\n' "$out"

if [ "$status" -eq 0 ]; then
  doc=$(node scripts/board-document.mjs --pdf --release 2>&1)
  docstatus=$?
  printf '%s\n' "$doc"
  if [ "$docstatus" -ne 0 ]; then
    printf 'THE PDF DID NOT PUBLISH (exit %s). The GitHub edition DID.\n' "$docstatus"
    printf 'The board reads the PDF; the issue is only the data trail. Treat this as a missing edition.\n'
    status=$docstatus
  fi
fi

case "$status" in
  0) printf 'POSTED (exit 0): GitHub edition and PDF draft release, from one run\n' ;;
  3) printf 'NOT POSTED (exit 3): the read set is not main'"'"'s. NO PARTIAL EDITION WAS PUBLISHED.\n'
     printf 'This is the guard working. Todays edition is MISSING, which is a fact about this process\n'
     printf 'and not a quiet day -- see the issue body. Fix the read set and re-run by hand.\n' ;;
  4) printf 'NOT POSTED (exit 4): the board release tag is already PUBLISHED, so its asset was not\n'
     printf 'replaced -- that would change a document somebody has already been given.\n' ;;
  5) printf 'NOT POSTED (exit 5): NO EXECUTIVE SUMMARY was written for today.\n'
     printf 'A missing summary is a MISSING EDITION, never a summary-less document -- a summary\n'
     printf 'assembled from the sections is what the board explicitly forbade. Write at most 120 words\n'
     printf 'in docs/board/summaries/<today>.md and re-run by hand.\n' ;;
  *) printf 'NOT POSTED (exit %s): unexpected failure, text above. No edition was published.\n' "$status" ;;
esac

exit "$status"
