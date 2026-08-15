# The control plane, on Proxmox

The thing that drives the fleet: provisions workers, deploys code to them, wakes and sleeps them, serves
the dataset pages they fetch, and runs the capture orchestration and the judge.

It exists as a document because ADR 0001 said *"the control plane is portable"* and portable meant
**could**, not **does** — it ran on one Mac, and that Mac was in the path of every corpus run. Three
separate ways that bit in a single day: macOS blocked node from the LAN by a privacy toggle, the dataset
page server lived on a laptop, and a four-hour run needed that laptop awake and unslept.

## Create the container

On the Proxmox host:

```bash
pveam update
pveam available --section system | grep debian-12          # pick the current one
pveam download local debian-12-standard_12.7-1_amd64.tar.zst

pct create 120 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname a11y-control \
  --cores 2 --memory 4096 --swap 1024 \
  --rootfs local-lvm:32 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp,firewall=0 \
  --features nesting=1 \
  --unprivileged 1 \
  --onboot 1 \
  --start 1
```

### Why each of those, where it is not obvious

- **`bridge=vmbr0`, not NAT.** This is the one that will silently ruin your day. Wake-on-LAN magic
  packets are layer-2 broadcast and **do not route** — `wake.yml` sends to `255.255.255.255`, which is
  limited broadcast and never crosses a subnet. A NAT'd control plane can provision a worker over SSH,
  deploy to it, read its `/health`, and then be completely unable to wake it. Same reasoning if you put
  the workers on their own VLAN: the control plane must be **in that VLAN**.
- **The workers must be able to reach IT, too.** Not just the other way round. Every capture makes the
  worker's browser fetch dataset pages from this box on `:5050` — `host-address.mjs` exists because a
  wrong answer there produces captured error pages, which is evidence rot rather than an outage.
- **`--memory 4096`.** The judge is our own scorer (a frozen MiniLM encoder plus 27 KB of heads), not a
  rented API, so it runs here. 2 GB is enough to orchestrate and too tight to score comfortably.
- **`--rootfs 32`.** The repo plus `node_modules` plus the corpus. `runs/` is gitignored and is ~2,122
  captures; a corpus snapshot was 69 MB compressed, and it grows.
- **`--unprivileged 1`.** Nothing here needs kernel capabilities. `nesting=1` is only so `pipx`
  and npm's sandboxing behave.
- **`--onboot 1`.** A control plane that does not survive a Proxmox reboot has reintroduced the problem
  it was built to solve, in a new location.

## Bootstrap it

```bash
pct enter 120
apt-get update && apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/DanBeckDev/a11y-witness/main/packages/worker-fleet/src/provisioning/bootstrap-control-plane.sh | bash
```

That installs Node, git, the repo, **ansible-core plus the three collections**, and generates the
fleet's SSH key. It prints the public half — that is what workers must trust.

It is idempotent: re-run it after any change and every step skips itself when already done.

## The key lives here now

The bootstrap generates `~/.ssh/a11y-witness_ed25519` **on this box**, deliberately rather than copying
one from a laptop. A fleet key on a Mac makes that Mac load-bearing again by a different route, which is
the exact thing this move exists to stop.

Two ways it reaches a worker:

```bash
# a box being built from scratch — served during the PXE install
packages/worker-fleet/src/provisioning/bare-metal/serve-bootstrap.sh ~/.ssh/a11y-witness_ed25519.pub

# a box already running — needs a way in already, so this is for rotation
cd packages/worker-fleet/ansible
ansible-playbook ssh-key.yml -l <host> -e a11y_operator_key="$(cat ~/.ssh/a11y-witness_ed25519.pub)"
```

## What does NOT move here

Nothing macOS-only, and that is checked rather than hoped: with `A11Y_WORKERS` set, `leaseWorker`
returns at its first line and `capture-screenreader-dataset.mjs` returns the explicit pool before
`leaseWorkerPool` is called — so the UTM path is never entered.

The **UTM guests on the Mac keep their own lifecycle** through `worker-ctl.sh` and are not managed from
here. They are a development convenience; the bare-metal fleet is the thing.

## Verify it, before trusting it

```bash
npm run doctor                    # every check names its own fix
npm run fleet:discover            # does it see the workers, and does the inventory agree
cd packages/worker-fleet/ansible && ansible a11y_workers -m ansible.windows.win_ping
```

The middle one is the specific answer to "is this box on the right network" — if it can scan and find
workers, it shares a segment with them, which is what Wake-on-LAN needs.
