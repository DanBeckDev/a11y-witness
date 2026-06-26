# ADR 0003: Reproducible testing in CI + GitHub Action as the primary distribution

- Status: Proposed
- Date: 2026-06-26

## Context

Two gaps block the project from being usable or trustworthy beyond the author's
machine.

1. **Capture is not reproducible and has no automated test.** It runs only on a
   hand-built Proxmox Windows VM, provisioned by a manual README recipe and
   driven over SSH. No contributor can reproduce it, and `capture-core.mjs` is
   validated only by hand-run captures — a real risk for a tool whose whole
   claim is trustworthiness, and weak as reproducible method.
2. **There is no way for anyone to consume the product.** The `witness` CLI
   needs a capture worker and judges via the author's local Codex login. That
   login is specific to one machine; nobody else can run the judge as-is.

The unlock for both: **Guidepup is designed to run real screen readers in CI.**
`@guidepup/setup` ships a CLI *and* a GitHub Action (`guidepup/setup-action`),
and its supported OS list (Windows Server 2022/2025, macOS Sonoma/Sequoia/Tahoe)
is the GitHub-hosted runner lineup. Real NVDA can therefore run on
`windows-latest` — which makes capture reproducible by anyone **and** is the
foundation of the most natural distribution vector for a developer a11y tool: a
GitHub Action other teams drop into their own CI. One capability, both goals.

We currently use `@guidepup/setup` only as a manual one-time step on the VM; we
do not use the Action form or any CI.

## Decision

1. **Testing environment: run real NVDA capture in GitHub Actions** via
   `guidepup/setup-action` on a Windows runner. This becomes the first automated
   test of the capture half (capture the bundled W3C tutorial fixtures, diff
   against the committed JSON), and the reproducible path for any contributor.
   The Proxmox VM remains an optional always-on worker, not the only path.

2. **Distribution: ship a GitHub Action as the primary consumption model.**
   Teams add `a11y-witness` to their workflow; on each PR it sets up NVDA, starts
   the worker, captures the target/preview URL, judges it, and reports findings
   (job summary + PR comment, optionally failing on new violations above a
   severity threshold). It reuses the exact CI infra from (1).

3. **Make the judge model backend pluggable.** The judge currently shells to
   Codex. Abstract that one boundary into a backend interface with
   implementations: Codex CLI (author, local — preserves the "no metered API"
   constraint), BYO Anthropic/OpenAI key (contributors and Action users), and a
   hosted endpoint (a future SaaS). External consumption requires this; the
   author's workflow is unchanged.

## Plan (dependency-ordered; each phase reuses the last)

- **Phase 0 — De-risk: prove real NVDA in GitHub Actions.** A throwaway workflow
  on `windows-2022`: `guidepup/setup-action` -> run capture against one tutorial
  page -> assert a non-empty transcript and the expected structure. This proves
  the interactive-session/Edge-focus needs work on a hosted runner *before* we
  build on it. No claim that CI-NVDA works until this is green.
- **Phase 1 — Capture-regression CI (the test harness).** Promote the spike to
  `capture-test.yml`: capture the good/bad tutorial pages, diff against committed
  fixtures with tolerance for known nondeterminism. Extract a one-shot capture
  entrypoint (URL+opts -> JSON) alongside the HTTP worker, both on the shared
  `capture-core.mjs`. Document `npx @guidepup/setup` as the one-command local
  path. (Optional fast layer: `@guidepup/virtual-screen-reader` for millisecond,
  OS-independent logic tests — a simulation, so it complements, never replaces,
  real-NVDA-in-CI.)
- **Phase 2 — Pluggable judge backend.** Backend interface + Codex / Anthropic /
  OpenAI implementations, env-selected. Eval keeps running on Codex locally.
- **Phase 3 — The GitHub Action (the product).** `a11y-witness-action`: on a
  Windows runner, setup -> capture -> judge (user's key) -> findings as a job
  summary + PR comment + optional failing check. Inputs: `url(s)`, `task`,
  `probe-forms`, `fail-on`, `api-key`. Ship an example workflow + marketplace
  listing.
- **Phase 4 (later) — Hosted layer.** The AGPL open-core SaaS (managed capture
  pool + judge-as-a-service + dashboard) once the Action proves demand. This is
  also where metered LLM cost becomes COGS rather than a personal expense.

## Consequences

- The capture half finally gets automated regression coverage, and the project
  becomes forkable-and-runnable by anyone — a credibility step, not just convenience.
- Distribution centers where accessibility regressions actually happen (PRs).
- The pluggable backend is a clean seam that serves local use, CI, and SaaS from
  one engine; the "no metered API for the author" constraint is preserved.
- Risk: GitHub-hosted NVDA may not satisfy our exact capture needs (focus,
  interactive session). Phase 0 exists precisely to find out cheaply.
- Out of scope here: expert human-agreement validation of the judge (orthogonal;
  can proceed in parallel) and VoiceOver/macOS capture (now CI-automatable per
  Guidepup, but deferred — see ADR 0001).

## Alternatives considered

- **Self-contained CLI first** (drive the local OS's screen reader): simplest for
  individual auditors, but narrower reach and does not produce the reproducible
  CI test environment we also need.
- **Hosted SaaS first**: the eventual commercial layer, but the largest build
  (judge-as-a-service, capture pool, UI, auth, billing) and premature before the
  Action validates demand.
- **Keep the VM-only worker**: rejected — not reproducible, not distributable.
