#!/bin/bash
# ONE COMMAND, and it PROVES what it did rather than reporting success.
#
#   bash scripts/install-board-report.sh
#
# Installs the launchd job that posts the daily board report at 08:00 from this checkout. Idempotent:
# safe to re-run, and re-running is how you pick up a moved checkout.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL=com.a11y-witness.board-report
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/a11y-witness/board-report.log"
NODE_BIN="$(dirname "$(command -v node)")"

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
sed -e "s|__REPO__|$REPO|g" -e "s|__NODE_BIN__|$NODE_BIN|g" -e "s|__LOG__|$LOG|g" \
  "$REPO/docs/board/com.a11y-witness.board-report.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# PROVE IT, over a channel that does not share a failure mode with the install. `launchctl bootstrap`
# returning 0 says the file parsed; `launchctl print` says the job exists and when it will run.
echo
if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  echo "INSTALLED: $LABEL is registered and will run at 08:00 local time."
  echo "  plist:  $PLIST"
  echo "  log:    $LOG"
  echo "  test it now, WITHOUT waiting for 08:00 and without posting:"
  echo "      npm run board:report"
  echo "  or force one edition now:"
  echo "      launchctl kickstart gui/$(id -u)/$LABEL && tail -40 $LOG"
  echo "  remove it:"
  echo "      launchctl bootout gui/$(id -u)/$LABEL && rm $PLIST"
else
  echo "FAILED: $LABEL is not registered after bootstrap. Nothing is scheduled." >&2
  exit 1
fi
