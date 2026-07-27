#!/usr/bin/env bash
# Start, pause, stop and check the local NVDA worker VM, so it is not burning resources
# while you are not capturing.
#
#   ./scripts/local-worker/worker-ctl.sh up            # make it ready (start or resume), wait for /health
#   ./scripts/local-worker/worker-ctl.sh pause         # freeze it: ~0.6% CPU, instant resume, RAM not guaranteed
#   ./scripts/local-worker/worker-ctl.sh stop          # shut it down: nothing held, ~15 s to come back
#   ./scripts/local-worker/worker-ctl.sh status        # state, resource use, health
#   ./scripts/local-worker/worker-ctl.sh json          # the same, machine-readable (used by the CLI)
#   ./scripts/local-worker/worker-ctl.sh pool          # every a11y-worker* VM, as JSON
#   ./scripts/local-worker/worker-ctl.sh pool-up       # start them all, wait for health
#
# One VM serves one capture at a time, so throughput comes from more VMs. `pool` reports the
# lot; add one with clone-worker.sh (which handles the duplicate-MAC trap).
# Operate on a single named VM with A11Y_VM_NAME=a11y-worker-2.
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
#   | stopped      | none (no process) | none                  | 12-15 s, once 81 s |
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
# included. Do not read 12-15 s as a guarantee, though: a later run took 81 s, on a busier
# host with Windows doing its own post-boot work. `up` waits for /health rather than a fixed
# delay for exactly that reason. It comes back unattended because auto-logon plus the
# at-logon trigger restart the worker -- see docs/local-worker-vm.md.
set -euo pipefail

VM_NAME="${A11Y_VM_NAME:-a11y-worker}"
PORT="${A11Y_PORT:-8765}"
CMD="${1:-status}"
SHUTDOWN_GRACE_S=120   # how long to let Windows shut down cleanly before forcing
RECLAIM_SETTLE_S=45    # give the host a chance to reclaim pages before reporting usage
HEALTH_TIMEOUT_S=5     # per probe
HEALTH_TRIES=3         # before calling a worker unreachable
HEALTH_GAP_S=2         # between probes
ARG="${2:-}"

die() { echo "error: $*" >&2; exit 1; }
command -v utmctl >/dev/null || die "utmctl not found (brew install --cask utm)"

# utmctl is a client for the UTM APP, not a standalone daemon. With UTM not running it cannot
# answer, and the symptoms are misleading: a VM reports its state as `unknown` (or the command
# fails outright) even though the bundle is present and intact. Seen for real -- quitting UTM
# to edit its preferences made every utmctl call useless until the app was relaunched.
#
# So launch it and wait, rather than reporting a healthy VM as unknown.
ensure_utm_running() {
  pgrep -x UTM >/dev/null && return
  echo "UTM is not running (utmctl needs the app); launching it ..."
  open -a UTM || die "could not launch UTM"
  for _ in $(seq 1 15); do
    sleep 2
    utmctl list >/dev/null 2>&1 && { echo "  UTM is up"; return; }
  done
  die "UTM did not become responsive. Open it once by hand and check it starts cleanly."
}
ensure_utm_running

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

# `unknown` means utmctl could not answer, not that the VM is broken. Almost always UTM was
# not running (handled above) or the UUID is stale -- so say which, instead of leaving a
# caller to conclude the guest is dead.
explain_unknown() {
  echo "  state 'unknown' means utmctl could not answer for this VM, NOT that the guest is broken." >&2
  echo "  UTM app running: $(pgrep -x UTM >/dev/null && echo yes || echo NO)" >&2
  echo "  guest process:   $(pgrep -f QEMULauncher >/dev/null && echo running || echo none)" >&2
  echo "  registered VMs:" >&2; utmctl list 2>&1 | sed 's/^/    /' >&2
}

guest_ip() {
  utmctl ip-address "$1" 2>/dev/null \
    | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | grep -v '^127' | head -1
}

# One probe. Needs the guest agent to report an IP first, which only happens once the guest
# tools are installed.
health_once() {
  local ip; ip="$(guest_ip "$1")"
  [ -n "$ip" ] || return 1
  curl -s -m "$HEALTH_TIMEOUT_S" "http://$ip:$PORT/health" 2>/dev/null
}

# A verdict, not a probe: retry before declaring a worker unreachable.
#
# One timed-out curl is not evidence of a dead worker, and treating it as such is how a
# healthy VM gets diagnosed as broken. The guest is busiest exactly when you most want to know
# it is alive -- Edge launching, and NVDA cold-starting every 25 captures -- and a worker
# restart takes /health down for 5-10s entirely legitimately.
#
# Measured during a live capture: 30/30 direct probes succeeded, none over a second, so this
# is not papering over a known flake. It is refusing to report a one-off as a fact.
health() {
  local body
  for attempt in $(seq 1 "$HEALTH_TRIES"); do
    body="$(health_once "$1")" && [ -n "$body" ] && { echo "$body"; return 0; }
    [ "$attempt" -lt "$HEALTH_TRIES" ] && sleep "$HEALTH_GAP_S"
  done
  return 1
}

wait_healthy() {
  local uuid="$1" limit="${2:-180}" waited=0 body
  while [ "$waited" -lt "$limit" ]; do
    body="$(health_once "$uuid" || true)"
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
    state="$(vm_state "$UUID")"
    echo "state:   $state"
    [ "$state" = unknown ] && explain_unknown
    echo "host:    $(qemu_usage)"
    ip="$(guest_ip "$UUID" || true)"
    echo "guest:   ${ip:-no ip (agent not reporting)}"
    body="$(health "$UUID" || true)"
    if [ -n "$body" ]; then
      echo "health:  $body"
      echo "$body" | grep -q '"busy":true' && echo "         (busy is NORMAL: one capture at a time by design)"
    else
      echo "health:  unreachable after $HEALTH_TRIES probes"
      if [ -n "${ip:-}" ]; then
        echo "         the guest is up and has an IP, so this is the WORKER, not the VM." >&2
        echo "         it is down for 5-10s during a restart; if it persists:" >&2
        echo "         utmctl exec <uuid> --cmd powershell.exe -NoProfile -Command 'Start-ScheduledTask -TaskName a11ysrv'" >&2
      else
        echo "         no guest IP either, so the VM itself is not ready. Try '$0 up'." >&2
      fi
    fi
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

  pool|pool-up)
    # Every VM whose name starts with the base name: a11y-worker, a11y-worker-2, ...
    # Emitted as one JSON array so a dispatcher can consume it without parsing prose.
    names="$(utmctl list | awk -v n="$VM_NAME" '$3 ~ "^"n { print $3 }' | sort -u)"
    [ -n "$names" ] || die "no VM whose name starts with '$VM_NAME'"
    if [ "$CMD" = "pool-up" ]; then
      # Sequentially, not in parallel: two Windows guests booting at once contend badly for
      # disk, and one that is already up costs nothing to skip.
      for n in $names; do
        echo "--- $n ---" >&2
        A11Y_VM_NAME="$n" "$0" up >&2 || echo "  '$n' did not come up" >&2
      done
    fi
    printf '['
    first=1
    for n in $names; do
      entry="$(A11Y_VM_NAME="$n" "$0" json 2>/dev/null || true)"
      [ -n "$entry" ] || continue
      [ "$first" -eq 1 ] || printf ','
      printf '%s' "$entry"
      first=0
    done
    printf ']\n'
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

  *) die "unknown command '$CMD' (up | pause | stop | status | json | pool | pool-up | idle-pause [min] | idle-stop [min])";;
esac
