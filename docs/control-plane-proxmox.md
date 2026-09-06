# The control plane, on Proxmox

The thing that drives the fleet: provisions workers, deploys code to them, wakes and sleeps them, serves
the dataset pages they fetch, and runs the capture orchestration and the judge.

It exists as a document because ADR 0001 said *"the control plane is portable"* and portable meant
**could**, not **does** — it ran on one Mac, and that Mac was in the path of every corpus run. Three
separate ways that bit in a single day: macOS blocked node from the LAN by a privacy toggle, the dataset
page server lived on a laptop, and a four-hour run needed that laptop awake and unslept.

## Two containers, not one

ADR 0012 splits fleet **control** from the **lab**, and the reason is credentials rather than tidiness:
the SSH key that can reconfigure twelve Windows machines should not share a box with 100 MB of npm
transitive dependencies and a Python venv. Nothing in the capture pipeline needs that key — ADR 0001
already says the pipeline talks to workers over HTTP.

| | `a11y-control` | `a11y-lab` |
|---|---|---|
| fleet SSH key, Ansible | **yes** | no |
| node_modules, venv, scorer | no | **yes** |
| the corpus | no | **yes**, on a mounted volume |
| can provision / deploy / **sleep** | yes | no |
| can **wake** | yes | **yes** — a magic packet needs no secret |
| size | 1 GB / 8 GB | 4 GB / 32 GB |

The lab can turn a machine **on**, and cannot turn it **off** or reconfigure it. That split falls out of
the physics rather than out of policy, which is why it will not erode.

## Create them

On the Proxmox host:

```bash
pveam update
pveam available --section system | grep debian-12          # pick the current one
pveam download local debian-12-standard_12.7-1_amd64.tar.zst

# CONTROL — tiny, holds the fleet key, rebuildable in a minute
pct create 120 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname a11y-control \
  --cores 1 --memory 1024 --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp,firewall=0 \
  --unprivileged 1 --onboot 1 --start 1

# LAB — the capture pipeline and the judge, corpus on a SEPARATE volume
pct create 121 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname a11y-lab \
  --cores 2 --memory 4096 --swap 1024 \
  --rootfs local-lvm:32 \
  --mp0 /mnt/pve/<storage>/a11y-runs,mp=/opt/a11y/runs \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp,firewall=0 \
  --features nesting=1 \
  --unprivileged 1 --onboot 1 --start 1
```

### Why each of those, where it is not obvious

- **`bridge=vmbr0`, not NAT.** This is the one that will silently ruin your day. Wake-on-LAN magic
  packets are layer-2 broadcast and **do not route** — both `wake.yml` and `fleet:wake` send to
  `255.255.255.255`, which is limited broadcast and never crosses a subnet. A NAT'd control plane can
  provision a worker over SSH, deploy to it, read its `/health`, and then be completely unable to wake
  it. Same reasoning if you put the workers on their own VLAN: **both containers must be in it.**
- **`--mp0` on the lab.** The corpus is 74 MB, 5,323 captures, **~3 h 46 m of measured fleet time**, and
  it is what `evidence:check` diffs against. On a mounted volume it is covered by Proxmox's backup job
  and the container becomes disposable. In the rootfs, the crown jewels are hostage to a container you
  might rebuild while debugging.
- **The workers must be able to reach the LAB.** Not just the other way round. Every capture makes the
  worker's browser fetch dataset pages from it on `:5050` — `host-address.mjs` exists because a wrong
  answer there produces captured error pages, which is evidence rot rather than an outage.
- **Lab `--memory 4096`.** The judge is our own scorer (a frozen MiniLM encoder plus 27 KB of heads), not
  a rented API, so it runs here. 2 GB orchestrates and is too tight to score comfortably.
- **Control `--memory 1024`, `--rootfs 8`.** It holds node, git, ansible and a checkout — no
  `node_modules`, no venv, no corpus. `deploy.yml` computes `codeVersion` by importing
  `code-version.mjs` by path, which needs nothing but node stdlib.
- **`--unprivileged 1`.** Neither needs kernel capabilities. `nesting=1` on the lab is only so pipx and
  npm's sandboxing behave.
- **`--onboot 1`.** A control plane that does not survive a Proxmox reboot has reintroduced the problem
  it was built to solve, in a new location.


## Bootstrap it

One script builds either, so the shared half cannot drift:

```bash
pct enter 120   # control
apt-get update && apt-get install -y curl
A11Y_ROLE=control bash <(curl -fsSL https://raw.githubusercontent.com/DanBeckDev/a11y-witness/main/packages/worker-fleet/src/provisioning/bootstrap-control-plane.sh)

pct enter 121   # lab
apt-get update && apt-get install -y curl
A11Y_REPO_PATH=/opt/a11y A11Y_ROLE=lab bash <(curl -fsSL https://raw.githubusercontent.com/DanBeckDev/a11y-witness/main/packages/worker-fleet/src/provisioning/bootstrap-control-plane.sh)
```

`bash <(curl ...)` rather than `curl | bash`: the role comes from the environment, and a piped script
cannot be handed one cleanly. `A11Y_ROLE=both` remains the default for a single-box setup — the thing to
grow out of, not the target.

That installs Node, git, the repo, **ansible-core plus the three collections**, and generates the
fleet's SSH key. It prints the public half — that is what workers must trust.

It is idempotent: re-run it after any change and every step skips itself when already done.

## The corpus is its own private repo

`git@github.com:DanBeckDev/a11y-corpus.git` — 2,122 captures, the pages they describe, and the manifest.
The lab bootstrap clones it; `A11Y_CORPUS_URL` overrides, and accepts a tarball URL for a box without
access to the private repo.

**Private, and the main repo is public** — committing these there would publish the internal test pages
the tool is validated against, and anything public is eventually trained on. The publishable artifact is
external-page evidence instead; see ADR 0010.

**Versioned rather than regenerated**, because a capture is not reproducible: `browserVersion` is in the
capture cache key precisely so evidence taken under one Edge release is not confused with another's.
Recapturing after an update gives a *different* corpus. It is also 3 h 46 m of fleet time.

Git suits it: 42 MB of pretty-printed JSON packs to 4 MB, and `git diff` shows exactly which
announcements changed between recaptures — a research capability, not just recovery.

`npm run corpus:backup` remains the belt to that repo's braces: a local verified archive, so the corpus
does not depend on one vendor. It refuses to report success without a destination and verifies by
reading the copy back.

## The key lives here now

The bootstrap generates `~/.ssh/<fleet key filename>` **on this box**, deliberately rather than copying
one from a laptop. A fleet key on a Mac makes that Mac load-bearing again by a different route, which is
the exact thing this move exists to stop.

Two ways it reaches a worker:

```bash
# a box being built from scratch — served during the PXE install
packages/worker-fleet/src/provisioning/bare-metal/serve-bootstrap.sh ~/.ssh/<fleet key filename>.pub

# a box already running — needs a way in already, so this is for rotation
cd packages/control/ansible
ansible-playbook ssh-key.yml -l <host> -e a11y_operator_key="$(cat ~/.ssh/<fleet key filename>.pub)"
```

## What does NOT move here

Nothing macOS-only, and that is checked rather than hoped: with `A11Y_WORKERS` set, `leaseWorker`
returns at its first line and `capture-screenreader-dataset.mjs` returns the explicit pool before
`leaseWorkerPool` is called — so the UTM path is never entered.

The **UTM guests on the Mac keep their own lifecycle** through `worker-ctl.sh` and are not managed from
here. They are **deprecated** — "The UTM is deprecated, that was a testing thing" (repository owner,
2026-09-05) — kept only for a quick single-worker trial; the bare-metal fleet is the thing.

## Verify it, before trusting it

```bash
npm run doctor                    # every check names its own fix
npm run fleet:discover            # does it see the workers, and does the inventory agree
cd packages/control/ansible && ansible a11y_workers -m ansible.windows.win_ping
```

The middle one is the specific answer to "is this box on the right network" — if it can scan and find
workers, it shares a segment with them, which is what Wake-on-LAN needs.
