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

out=$(node scripts/board-report.mjs --post --issue=20 2>&1)
status=$?

printf '%s\n' "$out"

case "$status" in
  0) printf 'POSTED (exit 0)\n' ;;
  3) printf 'NOT POSTED (exit 3): the read set is not main'"'"'s. NO PARTIAL EDITION WAS PUBLISHED.\n'
     printf 'This is the guard working. Todays edition is MISSING, which is a fact about this process\n'
     printf 'and not a quiet day -- see the issue body. Fix the read set and re-run by hand.\n' ;;
  *) printf 'NOT POSTED (exit %s): unexpected failure, text above. No edition was published.\n' "$status" ;;
esac

exit "$status"
