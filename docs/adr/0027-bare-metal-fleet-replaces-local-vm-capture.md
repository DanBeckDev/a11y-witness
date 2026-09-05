# ADR 0027: The bare-metal fleet replaces local UTM VMs as the capture path

## Status

Accepted. Amends ADR 0001's "Scaling model" section, which still describes the superseded design ("a
Proxmox cluster is well suited to hosting that fleet" of worker **VMs** cloned from one image) — recorded
here as a dated update rather than by silently editing that ADR, per this index's own stated practice.

## Context

ADR 0001 chose Windows/NVDA as the capture backend and a network-service architecture so the pipeline
could talk to any worker over HTTP. It did not settle HOW those Windows machines would be hosted, and the
project's own history answered that question twice.

**First: local UTM VMs on a single Mac.** Scriptable (ISO build, unattended install, auto-logon, NVDA
provisioning — `docs/local-worker-vm.md`), and it proved the pipeline end to end. It also scaled
**negatively**: measured interleaved on one host, throughput per worker fell from 0.079 captures/s at one
guest to 0.072 at three, because every guest spawned its own Edge with a dedicated profile and read the
same Chromium binaries from three separate qcow2 files, saturating the shared SSD. A worker VM cost the
host ~8 GB rather than its configured 4096 MB, capping a 36 GB Mac at two guests before swap set in, and a
second running guest measurably halved capture reliability even with CPU and swap ruled out (23.4 s median
/ 0 recoveries at one guest vs 35.1 s / 3 of 14 recoveries at two) — all recorded in CLAUDE.md's "Working
on a Mac" section, which is the record of *why*, not a description of the current path.

**Second, and current: a bare-metal fleet.** Ten physical machines (`inventory.yml`), provisioned from a
PXE server with an unattended Windows install (`packages/worker-fleet/src/provisioning/bare-metal/`) and
managed over SSH from a dedicated control-plane container (ADR 0012). The repository owner stated the
transition plainly: *"The UTM is deprecated, that was a testing thing."* (2026-09-05)

Until this ADR, that statement lived only in CLAUDE.md's own deprecation banner and was not reflected
consistently even there — the CLI's own worker-resolution fallback (`leaseWorker` in
`packages/worker-fleet/src/local-vm.ts`) still tried a local UTM VM by default when no worker was named and
no fleet was configured, and three of the docs most likely to be a new reader's first stop (`README.md`,
`docs/control-plane-proxmox.md`, `packages/worker-fleet/README.md`) said nothing about the deprecation at
all. `agent/utm-deprecation` (2026-09-06) measured the actual surface — roughly 2,190 lines confirmed
UTM-only, none of it removed — added a runtime warning at every UTM-only entry point, and corrected the
docs; this ADR is the decision record that work was closing.

## Decision

**This project's own capture fleet is bare metal. The local UTM VM path is retained, deprecated, for a
single-worker trial on a machine that is not part of any fleet — never as this project's own
infrastructure.**

Concretely:

- `npm run fleet:*` (status, deploy, provision, wake, sleep, recover) is the fleet lifecycle. `inventory.yml`
  is the single source of truth for which machines exist.
- `leaseWorker`'s resolution order stays explicit worker → `inventory.yml` → local UTM VM → historical
  `localhost:8765` default, with the UTM branch printing a deprecation notice naming `fleet:*` as the
  replacement every time it is reached (`utm-deprecated.mjs`). It is not refused outright: some machines
  genuinely have no fleet to reach and only a UTM guest, and deleting the ~2,190 lines that manage it is a
  separate decision from warning about it.
- The measurements behind the UTM section of CLAUDE.md (negative scaling, the ~8 GB-per-guest figure,
  `phys_footprint` vs RSS, the pool sizing algorithm) are kept as the record of *why* physical hardware
  won, not as instructions for running UTM guests today.

## Consequences

- A contributor without access to this project's own fleet still has a documented path: a bootstrap script
  for a spare Windows box (the same script the fleet's own boxes provision from), the CI Windows runner for
  no infrastructure at all, or — for a quick trial only — a local UTM VM.
- Deleting the UTM-only code is explicitly deferred (see `agent/utm-deprecation`'s report): it is not part
  of this decision, because removing it is safe only once nobody depends on the trial path it still serves,
  and that has not been measured.
- CLAUDE.md's UTM sections keep the "read as the record of why" framing rather than being deleted, because
  the measurements remain the reasoning for physical-hardware capacity decisions even though the guests
  they describe are no longer how this project captures.

## Alternatives considered

- **Continue scaling with local VMs, tuned harder.** Rejected by measurement: the negative-scaling result
  is a shared-disk contention effect (three guests reading the same Chromium binaries from three separate
  backing files), not a memory or CPU tuning problem — an afternoon spent right-sizing guest memory before
  the disk was measured addressed nothing.
- **Cloud VMs (a hosted Windows image per worker).** Not pursued: ADR 0001 already names this as a future
  tier for a hosted product, but it does not remove the per-guest disk-contention mechanism observed
  locally, and it introduces a recurring cost and a third environment (alongside CI and bare metal) to keep
  evidence-consistent.
- **Delete the UTM path now, as part of this decision.** Rejected: it is still a genuinely useful path for
  a contributor with no fleet and no spare Windows box, and CLAUDE.md's own rule — a deprecated path that
  is still the first one documented is not deprecated — was fixed here by making the deprecation loud and
  correcting the docs, not by removing the option before anyone has measured who still needs it.
