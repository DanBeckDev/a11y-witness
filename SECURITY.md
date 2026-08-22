# Security

## Reporting a vulnerability

Use GitHub's **[private vulnerability reporting](https://github.com/DanBeckDev/a11y-witness/security/advisories/new)**
on this repository. Please do not open a public issue for anything exploitable.

There is no SLA. This is a small project with one maintainer, and saying so is more useful than promising a
response time nobody is on call to meet.

## What this tool does that you should know about before running it

a11y-witness drives a real browser and a real screen reader against a page you name. Three of its behaviours
are worth understanding before you point it at something.

### It operates controls on the page, and one probe presses buttons

`probeForms` **submits forms and activates buttons** — that is how criteria 3.3.1 (error identification) and
4.1.3 (status messages) are reachable at all; an error nobody hears only exists after a submit.

It therefore defaults **on in the GitHub Action and off in the CLI**, and the split follows who owns the page:

- a workflow runs against your own application, where submitting is intended
- the CLI can be aimed at any URL, and **pressing *Book* on a stranger's site is not a review**

`chooseProbe` decides what may be pressed and is unit-tested for exactly that. A control is activated only
if it is a button whose name shares a meaningful word with the task you gave, or is submit-like — so
"show only bags" presses *Bags* and never *Delete account*. Disclosures are the one exception and are
activated unconditionally, because expanding something is side-effect-free.

**If you enable `probeForms` against a page you do not own, you are operating someone else's application.**

### The capture worker has no authentication, and binds all interfaces

The Windows worker that runs NVDA serves plain HTTP on port 8765 with **no authentication of any kind** and
no TLS. This is deliberate and documented (`packages/worker-fleet/ansible/README.md`), and it is why the
fleet is managed over SSH rather than by adding routes to the worker: *a mutating route there would be
unauthenticated remote code execution on every box in the fleet.*

The consequence for you:

- **Run workers on a trusted network segment only.** Never expose port 8765 to the internet, and do not
  assume a cloud provider's default security group does the right thing.
- A worker will capture any URL it is handed, from anyone who can reach it. Treat network reachability as
  full authority over that machine's browser.
- `/diagnostics` returns process lists, disk usage, browser profile sizes and screen-reader logs.

### Some environment variables are executable

`A11Y_PYTHON` is read at four call sites and becomes the interpreter that is executed. Passing it is
equivalent to running arbitrary code as the invoking user. The Ansible job interface never forwards
environment from its caller for this reason — its env is a fixed dictionary in the role, and jobs are named
from a fixed catalogue rather than passed as commands.

Treat `A11Y_PYTHON`, `A11Y_SCORER_MODEL` and `DATASET_ROOT` as trusted-input-only.

## What it sends where

**Nothing, by default.** The judge backend defaults to `local` — our own trained scorer, running on your
machine. No page content, transcript or finding leaves the machine unless you opt in.

`JUDGE_BACKEND=codex|anthropic|openai` exist for comparison against a rented model. Setting one sends the
capture transcript — which contains the page's text as a screen reader announced it — to that vendor. If the
page is behind your authentication, that transcript may contain data from it.

## Scope

In scope: anything that lets a page under test escape the capture sandbox, escalate on a worker, or reach
the control plane; anything that causes a finding to be silently fabricated or suppressed.

Out of scope: the unauthenticated worker port itself (documented above, by design), and denial of service
against your own fleet.

## Credential handling

ADR 0012 splits the control plane along what each side must hold: the control container holds the fleet SSH
key, the lab container holds **no** key, and Wake-on-LAN needs no credential at all. No password is stored
anywhere in this project. If you find one committed, that is a vulnerability — report it.
