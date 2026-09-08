#!/bin/bash
# Fetch today's board report into ~/Documents/a11ign-board-reports/ — a CONVENIENCE, not a
# dependency.
#
# The report is published by GitHub Actions to a draft Release; that is the delivery. This copies it
# somewhere a person can double-click. Nothing depends on it having been run, and a day it is not run is
# a day the document still exists on the Release.
#
#   bash scripts/fetch-board-report.sh            today
#   bash scripts/fetch-board-report.sh 2026-09-06  a given date
set -euo pipefail
# THE REPOSITORY IS READ, NOT WRITTEN DOWN. This said `a11ign/a11ign` literally -- the name the project
# takes at the transfer -- so the chairman's fetch printed "release not found" against a repository that
# does not exist yet. `repo-identity.mjs` is the one place that name lives and the one value that flips at
# the transfer; a second copy here is the fact-stated-twice shape with a date attached, and it was already
# wrong before the date arrived.
REPO="$(node -e 'import("./scripts/repo-identity.mjs").then(m => console.log(m.REPO))')"
DAY="${1:-$(date -u +%Y-%m-%d)}"
DEST="$HOME/Documents/a11ign-board-reports"
mkdir -p "$DEST"

# `gh release download` exits non-zero when the draft does not exist, which is the honest answer on a day
# the edition refused for want of a summary -- reported as itself rather than as an empty file.
if ! gh release download "board/$DAY" --repo "$REPO" --pattern '*.pdf' --dir "$DEST" --clobber 2>/tmp/fetch-board.err; then
  echo "No board report published for $DAY." >&2
  echo "Either the edition refused (most often: no executive summary was committed for that day), or" >&2
  echo "the workflow has not run yet. The workflow's own log says which." >&2
  cat /tmp/fetch-board.err >&2
  exit 1
fi
echo "$DEST/a11ign-board-$DAY.pdf"
