#!/bin/bash
# ONE COMMAND, and it PROVES what it did rather than reporting success.
#
#   bash scripts/install-board-report.sh
#
# Installs the launchd job that posts the daily board report at 08:00 from this checkout. Idempotent:
# safe to re-run, and re-running is how you pick up a moved checkout.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# TWO ENTRIES, INSTALLED TOGETHER. The 08:00 job publishes; the 21:00 job asks whether tomorrow's
# hand-written summary exists and says so on the tracker if it does not. Installing only the first gives
# you a schedule that can refuse silently at breakfast; they are one mechanism and one command.
LABEL=com.a11y-witness.board-report
CHECK=com.a11y-witness.board-summary-check
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
CHECK_PLIST="$HOME/Library/LaunchAgents/$CHECK.plist"
LOG="$HOME/Library/Logs/a11y-witness/board-report.log"
NODE_BIN="$(dirname "$(command -v node)")"

# THE CHECKOUT MUST BE ON `main`, AND THE BRANCH IS PRINTED EITHER WAY.
#
# The scheduled job runs from this directory at whatever branch it is sitting on, so installing from a
# feature branch schedules that branch's document. Measured 2026-09-06: the primary checkout was on a
# feature branch when a merge landed, and an 08:00 run would have rendered from it -- publishing a
# document whose form the board had rejected, automatically, the morning after they approved its
# replacement.
#
# `GIT_*` is scrubbed for the same reason every git spawn in this pipeline is: a leaked `GIT_DIR` makes
# this read a different repository's branch and answer confidently about the wrong tree.
BRANCH="$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR \
  git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
if [ "$BRANCH" != "main" ]; then
  echo "REFUSING to install: this checkout is on '$BRANCH', not main." >&2
  echo "  $REPO" >&2
  echo "The scheduled job renders from this directory at whatever branch it is on, so installing from" >&2
  echo "'$BRANCH' schedules that branch's document. Check out main and run this again." >&2
  echo "Nothing was installed." >&2
  exit 2
fi
echo "checkout: $REPO is on $BRANCH"

# THE MACHINE'S ZONE IS CHECKED, NOT ASSUMED. launchd's StartCalendarInterval is local time, and the
# issue body promises 08:00 Europe/London. A report whose stated time and actual time disagree is exactly
# the small untruth this pipeline exists to refuse, so it is stated loudly rather than left to be found.
ZONE="$(readlink /etc/localtime | sed 's|.*/zoneinfo/||')"
if [ "$ZONE" != "Europe/London" ]; then
  echo "WARNING: this machine's timezone is $ZONE, not Europe/London." >&2
  echo "         The job will fire at 08:00 $ZONE. Either change the hour in the plist or say so in" >&2
  echo "         issue #20's body -- do not leave the two disagreeing." >&2
fi

mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"
for pair in "$LABEL:$PLIST" "$CHECK:$CHECK_PLIST"; do
  label="${pair%%:*}"; dest="${pair#*:}"
  sed -e "s|__REPO__|$REPO|g" -e "s|__NODE_BIN__|$NODE_BIN|g" -e "s|__LOG__|$LOG|g" \
    "$REPO/docs/board/$label.plist" > "$dest"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$dest"
done

# PROVE IT, over a channel that does not share a failure mode with the install. `launchctl bootstrap`
# returning 0 says the file parsed; `launchctl print` says the job exists and when it will run.
echo
missing=""
for label in "$LABEL" "$CHECK"; do
  launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1 || missing="$missing $label"
done
if [ -z "$missing" ]; then
  echo "INSTALLED: both entries are registered."
  echo "  $LABEL  — 08:00, publishes the edition"
  echo "  $CHECK  — 21:00, reports a missing summary for tomorrow, and writes none"
  echo "  plists: $PLIST"
  echo "          $CHECK_PLIST"
  echo "  log:    $LOG"
  echo "  test it now, WITHOUT waiting for 08:00 and without posting:"
  echo "      npm run board:report"
  echo "  or force one edition now:"
  echo "      launchctl kickstart gui/$(id -u)/$LABEL && tail -40 $LOG"
  echo "  remove them:"
  echo "      launchctl bootout gui/$(id -u)/$LABEL && rm $PLIST"
  echo "      launchctl bootout gui/$(id -u)/$CHECK && rm $CHECK_PLIST"
else
  echo "FAILED:$missing not registered after bootstrap. The schedule is INCOMPLETE." >&2
  echo "A publish job without its 21:00 check refuses silently at breakfast; that is the case this" >&2
  echo "pair exists for, so a partial install is a failure rather than a warning." >&2
  exit 1
fi
