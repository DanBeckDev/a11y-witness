# ADR 0001: Capture workers as network services, Windows/NVDA first

- Status: Proposed
- Date: 2026-06-25

## Context

The core differentiator of `a11y-witness` is that it drives a **real screen
reader** through real navigation, rather than checking code against rules or
tabbing through controls. That commitment runs straight into a hard fact:
screen readers are operating-system-bound desktop applications, not libraries.

- **VoiceOver** (macOS) cannot be containerised at all. Apple permits macOS
  virtualisation only on Apple hardware, and macOS does not run in a container.
  VoiceOver always needs a real Mac. Its automation path (AppleScript via
  Guidepup) is also the most fragile of the three and is deprecating on recent
  macOS; our spike hit repeated `-1708 errAEEventNotHandled` failures.
- **NVDA / JAWS** (Windows) need a full, interactive Windows desktop session
  and the Windows speech stack. Windows Server containers are headless and have
  no desktop or audio, so NVDA does not run in them. "Full Windows in a
  container" exists only by embedding a Windows VM via KVM, which needs nested
  hardware virtualisation and so is not portable to an arbitrary host (for
  example, an Apple Silicon Mac). The reproducible form of NVDA is a **Windows
  VM**, not a portable Docker image.
- **Orca** (Linux, AT-SPI2) is the only screen reader that runs headless in a
  portable Linux container. But Orca is a small minority of real-world usage, so
  it cannot be the fidelity benchmark.

Two further forces shape the design:

1. **Representativeness and reliability point the same way.** The long-running
   WebAIM screen-reader surveys put JAWS and NVDA (both Windows) as the
   most-used desktop screen readers. NVDA on Windows is also the
   best-supported, most reliable automation target (Guidepup runs it in CI on
   Windows runners and captures its spoken text without audio hardware). So
   Windows/NVDA is simultaneously the most representative and the most reliable
   first target. This is not a compromise.
2. **This is open source.** Whatever we build must be reproducible, horizontally
   scalable, and usable by people who do not have our infrastructure. A
   hand-tuned pet VM fails all three.

## Decision

**1. A capture backend is a network service behind a stable interface, not a
machine we log into.** Each backend drives one screen reader and exposes
`POST /capture { url, task } -> { transcript, ... }` (see
`src/capture/backend.ts`). SSH is only for provisioning and debugging; the
pipeline talks to workers over HTTP. This is what makes the system scale (run N
workers, dispatch jobs across them) and what makes a worker reusable by anyone.

**2. The control plane is portable; only capture workers are OS-bound.**
Orchestration, WCAG grounding, the AI judge, and reporting run in a single
portable container that runs anywhere. The OS-specific part is isolated to the
capture worker and is swappable per the interface.

**3. Windows/NVDA is the primary backend.** VoiceOver (macOS) and Orca (Linux)
are secondary backends behind the same interface, added later: VoiceOver for
Mac and iOS user coverage, Orca as an optional fully-portable local dev tier.

**4. The judge is provider-pluggable.** It must not be chained to one person's
account. It defaults to the Codex CLI (no metered cost on a local Codex login)
but can target the OpenAI or Anthropic APIs, or a local model, so other people
can run the project with their own credentials.

**5. Three tiers of usability, so "other people" of every kind are served:**

| Tier | Form | Audience | Infra needed |
|---|---|---|---|
| CI | GitHub Actions `windows-latest` job | Contributors, our own CI | None (ephemeral runner) |
| Bootstrap | One PowerShell script | Anyone with any Windows box | A Windows machine |
| Image | Packer template + Terraform (Proxmox / cloud) | Us, and a hosted product | A hypervisor or cloud account |

The CI tier is the most important for adoption: a contributor can run the full
real-NVDA pipeline on a pull request without owning any infrastructure.

## Scaling model

One NVDA worker handles one capture at a time: a single desktop session, one
screen reader, one focused browser. Throughput scales **horizontally** by
running more worker VMs (cloned from one image) and dispatching jobs across the
pool. A Proxmox cluster is well suited to hosting that fleet; the same image
shape works on cloud Windows instances for a hosted product.

## Consequences

- There is no single Docker image that runs the whole product on any machine.
  "Runs anywhere" holds for the control plane; capture lives where the OS allows.
- We depend on a Windows worker for representative fidelity. We provision the
  first one on a Proxmox VM to prove the pipeline, then codify it.
- We must prove **one** real NVDA capture end to end before building the
  bootstrap script, the image, or the fleet. Reproducibility wrapped around an
  unproven capture is wasted work.
- VoiceOver coverage will always require a Mac in the pool. That is inherent to
  the platform, not a limitation we can engineer away.

## Status of the bet so far

The judge half is substantially proven: it is grounded in the verified WCAG 2.2
A/AA criteria (`src/wcag/criteria.ts`, validated against the W3C spec), cites
only from that list, catches the planted defects consistently, and avoids false
positives. The unproven half is real screen-reader capture, which this decision
routes through Windows/NVDA.
