#!/usr/bin/env bash
# Start, pause, stop and check the local NVDA worker VM, so it is not burning resources
# while you are not capturing.
#
#   ./scripts/local-worker/worker-ctl.sh up            # make it ready (start or resume), wait for /health
#   ./scripts/local-worker/worker-ctl.sh pause         # freeze it: ~0.6% CPU, instant resume, RAM not guaranteed
#   ./scripts/local-worker/worker-ctl.sh stop          # shut it down: nothing held, ~15 s to come back
#   ./scripts/local-worker/worker-ctl.sh status        # state, resource use, health
#   ./scripts/local-worker/worker-ctl.sh json          # the same, machine-readable (used by the CLI)
#   ./scripts/local-worker/worker-ctl.sh idle-pause 15 # watch, then pause after 15 idle minutes
#   ./scripts/local-worker/worker-ctl.sh idle-stop 30  # same but shut down instead
#
# Measured on an M4 Max, 4 vCPU / 8 GB guest. Every number here was observed on this
# machine; none is an estimate:
#
#   | state        | host CPU          | host RSS              | back to /health |
#   |--------------|-------------------|-----------------------|-----------------|
#   | running idle | 2-86%, spiky      | ~5 GB                 | -               |
#   | paused       | ~0.6%             | 0.8 GB *or* 4.5 GB    | under 1 s       |
#   | stopped      | none (no process) | none                  | 12-15 s         |
#
# Read the caveats before trusting the table:
#   - "running idle" is not idle. Windows keeps working in the background (Defender,
#     Update, the search indexer), so a single sample means nothing: consecutive readings
#     20 s apart gave 1.8%, 25% and 86%. That is why `pause` is worth having at all.
#   - `pause` reliably buys back CPU. It does NOT reliably give back memory. One paused run
#     settled to ~0.8 GB within 40 s; the next held ~4.5 GB for three minutes straight with
#     66% of host memory free. Whether the host reclaims a suspended guest's pages is not
#     ours to decide, so do not count on it.
#
# So: `pause` for a short gap between captures -- near-zero CPU and the guest never
# rebooted, so resume is instant. `stop` when you actually want the memory back, because it
# is the only one that guarantees it, and it is cheap: cold start reached /health in 12 s,
# 12 s and 15 s across three runs (`up` returns a few seconds later once it has the IP), and
# a capture immediately after a cold start was verified working, disclosure state change
# included. It comes back unattended because auto-logon plus the at-logon trigger restart
# the worker -- see docs/local-worker-vm.md.
set -euo pipefail

VM_NAME="${A11Y_VM_NAME:-a11y-worker}"
PORT="${A11Y_PORT:-8765}"
CMD="${1:-status}"
SHUTDOWN_GRACE_S=120   # how long to let Windows shut down cleanly before forcing
RECLAIM_SETTLE_S=45    # give the host a chance to reclaim pages before reporting usage
ARG="${2:-}"

die() { echo "error: $*" >&2; exit 1; }
command -v utmctl >/dev/null || die "utmctl not found (brew install --cask utm)"

# Resolve by UUID, never by name. Two registrations can share a name, and then `utmctl
# start <name>` silently picks the wrong one -- worse, `utmctl delete <name>` removes the
# shared bundle and takes the other VM's disk with it.
resolve_uuid() {
  [ -n "${A11Y_VM_UUID:-}" ] && { echo "$A11Y_VM_UUID"; return; }
  local matches
  matches="$(utmctl list | awk -v n="$VM_NAME" '$3 == n { print $1 }')"
  [ -n "$matches" ] || die "no VM named '$VM_NAME' (create one: scripts/local-worker/create-utm-vm.sh)"
  if [ "$(echo "$matches" | wc -l | tr -d ' ')" -gt 1 ]; then
    # Do NOT guess, and do NOT suggest deleting one. Duplicate registrations under the same
    # name point at the SAME <name>.utm bundle, so `utmctl delete` on either removes that
    # directory and destroys the other VM's disk and UEFI vars. That has already happened
    # here once; the aftermath is a start that fails with
    # 'The file "edk2-arm-vars.fd" doesn't exist'.
    die "several VMs are registered as '$VM_NAME':
$matches
Pick one explicitly:  A11Y_VM_UUID=<uuid> $0 $CMD

WARNING: do not 'utmctl delete' either of them. They share one bundle directory, so
deleting either destroys the other's disk. Resolve it by renaming one VM in the UTM UI
(which moves its bundle) before deleting anything."
  fi
  echo "$matches"
}

vm_state() { utmctl status "$1" 2>/dev/null || echo unknown; }

guest_ip() {
  utmctl ip-address "$1" 2>/dev/null \
    | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | grep -v '^127' | head -1
}

# Returns the /health body on success. Needs the guest agent to report an IP first, which
# only happens once the guest tools are installed.
health() {
  local ip; ip="$(guest_ip "$1")"
  [ -n "$ip" ] || return 1
  curl -s -m 5 "http://$ip:$PORT/health" 2>/dev/null
}

wait_healthy() {
  local uuid="$1" limit="${2:-180}" waited=0 body
  while [ "$waited" -lt "$limit" ]; do
    body="$(health "$uuid" || true)"
    if [ -n "$body" ]; then
      echo "  ready after ${waited}s: $body"
      return 0
    fi
    sleep 3; waited=$((waited + 3))
  done
  echo "  NOT ready after ${limit}s" >&2
  return 1
}

qemu_usage() {
  local pid; pid="$(pgrep -f QEMULauncher | head -1 || true)"
  if [ -z "$pid" ]; then echo "no qemu process (RAM released)"; return; fi
  ps -o pcpu=,rss= -p "$pid" | awk '{printf "cpu=%s%% rss=%.1fGB", $1, $2/1048576}'
}

UUID="$(resolve_uuid)"

case "$CMD" in
  up)
    state="$(vm_state "$UUID")"
    case "$state" in
      started) echo "already started";;
      paused)  echo "resuming from pause"; utmctl start "$UUID" >/dev/null;;
      *)       echo "cold starting (boot + auto-logon + worker task; waiting for /health)"; utmctl start "$UUID" >/dev/null;;
    esac
    if ! wait_healthy "$UUID"; then
      [ "$state" = started ] && echo "  it was already 'started', so it is either mid-shutdown or the worker task died: try '$0 stop && $0 up'" >&2
      exit 1
    fi
    ip="$(guest_ip "$UUID")"
    echo
    echo "  A11Y_WORKER=http://$ip:$PORT"
    ;;

  pause)
    [ "$(vm_state "$UUID")" = "started" ] || { echo "not running (state: $(vm_state "$UUID"))"; exit 0; }
    utmctl suspend "$UUID" >/dev/null
    # Give the host a chance to reclaim the suspended guest's pages before reporting, but
    # do not promise it will: observed both ~0.8 GB and ~4.5 GB while paused. Say which one
    # happened, so a still-large footprint is visible rather than assumed away.
    sleep "$RECLAIM_SETTLE_S"
    echo "paused ($(qemu_usage)) -- resume with: $0 up (under a second; the guest never rebooted)"
    echo "note: CPU is back either way; memory may or may not be. Use '$0 stop' to be sure of it."
    ;;

  stop)
    state="$(vm_state "$UUID")"
    [ "$state" = "stopped" ] && { echo "already stopped"; exit 0; }
    # A paused VM cannot be shut down gracefully -- resume it first so Windows can flush
    # and exit cleanly, rather than yanking the power from a frozen guest.
    if [ "$state" = "paused" ]; then
      echo "resuming briefly so the guest can shut down cleanly"
      utmctl start "$UUID" >/dev/null; sleep 5
    fi
    # --request, NOT the default. `utmctl stop` defaults to --force, which is a power-off
    # event: from Windows' point of view the plug was pulled, so every stop leaves a dirty
    # volume and the next boot can burn time on "Windows did not shut down properly" and a
    # chkdsk. --request sends ACPI shutdown and lets the guest flush.
    utmctl stop "$UUID" --request >/dev/null
    waited=0
    while [ "$waited" -lt "$SHUTDOWN_GRACE_S" ]; do
      pgrep -f QEMULauncher >/dev/null || break
      sleep 3; waited=$((waited + 3))
    done
    if pgrep -f QEMULauncher >/dev/null; then
      echo "  guest ignored ACPI shutdown after ${waited}s -- forcing"
      utmctl stop "$UUID" >/dev/null
      for _ in $(seq 1 10); do pgrep -f QEMULauncher >/dev/null || break; sleep 3; done
    fi
    echo "stopped after ${waited}s ($(qemu_usage))"
    ;;

  status)
    echo "vm:      $VM_NAME ($UUID)"
    echo "state:   $(vm_state "$UUID")"
    echo "host:    $(qemu_usage)"
    ip="$(guest_ip "$UUID" || true)"
    echo "guest:   ${ip:-no ip (agent not reporting)}"
    body="$(health "$UUID" || true)"
    echo "health:  ${body:-unreachable}"
    ;;

  json)
    # One line of JSON for the control plane (src/capture/local-vm.ts). Keeping every UTM
    # detail behind this command means the TS side never parses human-readable output and
    # never learns about utmctl, bundles or bookmarks.
    ip="$(guest_ip "$UUID" || true)"
    body="$(health "$UUID" || true)"
    healthy=false; [ -n "$body" ] && healthy=true
    busy=false; if echo "$body" | grep -q '"busy":true'; then busy=true; fi
    printf '{"uuid":"%s","name":"%s","state":"%s","ip":"%s","port":%s,"healthy":%s,"busy":%s}\n' \
      "$UUID" "$VM_NAME" "$(vm_state "$UUID")" "${ip:-}" "$PORT" "$healthy" "$busy"
    ;;

  idle-pause|idle-stop)
    mins="${ARG:-15}"
    action=pause; [ "$CMD" = "idle-stop" ] && action=stop
    echo "watching $VM_NAME; will $action after $mins idle minutes (Ctrl-C to stop watching)"
    idle=0
    while :; do
      body="$(health "$UUID" || true)"
      if [ -z "$body" ]; then
        echo "worker unreachable (state: $(vm_state "$UUID")) -- nothing to do"
        exit 0
      fi
      # `busy` is true only while a capture is in flight, so it is the honest activity
      # signal. Any capture resets the clock.
      if echo "$body" | grep -q '"busy":true'; then
        [ "$idle" -gt 0 ] && echo "  capture in flight, resetting idle clock"
        idle=0
      else
        idle=$((idle + 1))
      fi
      if [ "$idle" -ge "$mins" ]; then
        echo "idle $mins min -> $action"
        exec "$0" "$action"
      fi
      sleep 60
    done
    ;;

  *) die "unknown command '$CMD' (up | pause | stop | status | json | idle-pause [min] | idle-stop [min])";;
esac
