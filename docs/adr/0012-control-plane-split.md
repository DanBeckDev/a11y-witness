# ADR 0012 — Split fleet CONTROL from the LAB, along the credential boundary

## Status

Accepted. Supersedes nothing; it makes ADR 0001's existing boundary physical.

## Context

The control plane was about to become one Proxmox container doing two jobs:

- **Fleet management** — Ansible provisioning, deploying, restarting, waking and sleeping ~12 Windows
  machines. Occasional, and it holds the SSH key that can reconfigure every one of them.
- **The lab** — capture orchestration, the dataset page server the workers fetch from, the judge (our own
  scorer, not a rented API), and the corpus. Long-running, and it carries ~100 MB of npm transitive
  dependencies plus a Python venv.

Those have different lifecycles, different failure modes and different blast radii. Left together they
would have produced the coupling that is cheap to remove now and expensive at twelve machines.

The decisive argument is not tidiness. It is that **the credential able to reconfigure the entire fleet
would sit next to the largest supply-chain surface in the system.** A compromised transitive dependency
in the capture pipeline could reach the SSH key and, from there, twelve Windows boxes that auto-log-in to
unlocked desktops. Nothing about the capture pipeline needs that key: ADR 0001 already says *"SSH is only
for provisioning and debugging; the pipeline talks to workers over HTTP."*

Two facts made the split cheap, and both were measured rather than assumed:

- `codeVersion()` — the only thing fleet management needed from the JS workspace — imports **nothing but
  node stdlib and one sibling module**. Imported by path it produces `d1c98aa032198754`, identical to the
  workspace import. So the control container needs no `node_modules` at all, and there is still exactly
  one hasher (which `code-version.test.ts` enforces).
- **Wake-on-LAN needs no credential.** A magic packet is an unauthenticated UDP broadcast.

## Decision

**Two roles, selected by `A11Y_ROLE` in `bootstrap-control-plane.sh`.**

| | `control` | `lab` |
|---|---|---|
| fleet SSH private key | **yes** | no |
| Ansible + collections | yes | no |
| `node_modules` (~100 MB) | no | yes |
| Python venv, scorer model | no | yes |
| the corpus | no | yes, on a mounted volume |
| talks to workers via | SSH | **HTTP only** |
| can provision / deploy / restart / **sleep** | yes | no |
| can **wake** | yes | **yes** |

**The lab can turn a machine on, and cannot turn it off or reconfigure it.** That privilege split falls
out of the physics rather than out of policy, which is why it will not erode: waking needs no secret, and
every destructive operation does.

`fleet:wake` (node, `dgram`, no dependencies) is how the lab starts what a run needs, preserving this
repo's "a run starts what it needs" convention without giving the lab a credential. `wake.yml` remains
the operator's tool on control, where Ansible already lives. Same packet, different caller — this is not
the duplication the repo warns about, because there is no shared logic to drift, only a 102-byte format
that is fixed by specification and unit-tested against it.

`A11Y_ROLE=both` remains the default so a single-box setup still works. It is the thing to grow out of,
not the target.

## Consequences

- The lab container becomes **disposable**: rebuild it from the bootstrap script, because the only
  irreplaceable thing it holds — the corpus — is on a mounted volume, not in its rootfs.
- The control container becomes **trivial**: node, git, ansible, a checkout, a key. Minutes to rebuild.
- `deploy.yml` imports `code-version.mjs` by path rather than by package name. If that module ever grows
  an external dependency, the control container silently needs npm again — so it must not.
- **Sleeping the fleet after a run is no longer automatic.** A capture run wakes what it needs and leaves
  the machines up; powering them down is an operator or scheduled action on control. That is a real
  behaviour change and the accepted cost of the boundary.
- Two containers to maintain instead of one. Both are bootstrapped by the same script, so the shared
  half cannot drift — which is why the script is role-aware rather than forked into two.
- The inventory stays the single source of truth and is in git, so both roles read it without either
  depending on the other at runtime. **There is no service between them**, deliberately: an API for the
  lab to request a shutdown would introduce a failure mode where the lab is up, control is not, and a
  run cannot start against workers that are perfectly healthy.

## Alternatives considered

- **One container, boundary documented.** Cheapest, and exactly the tech debt this was raised to avoid.
- **Lab holds no fleet capability at all.** Strictest, but a capture run against a sleeping fleet just
  fails, and the repo's own convention is that a run starts what it needs.
- **Lab asks control over an API.** Most correct on paper. It adds a service to write, secure and keep
  running, plus a failure mode where healthy workers are unusable because control is down. For twelve
  machines and one operator, over-engineering.
