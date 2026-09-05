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

`probeKindFor` decides what may be pressed, `chooseProbe` only dispatches on its answer, and the decision is
unit-tested (`probe-choice.test.ts`). A control is activated only
if it is a button whose name shares a meaningful word with the task you gave, or is submit-like — so
"show only bags" presses *Bags* and never *Delete account*. Disclosures are the one exception and are
activated unconditionally, because expanding something is side-effect-free.

**If you enable `probeForms` against a page you do not own, you are operating someone else's application.**

#### A forms config TYPES VALUES, which `probeForms` never does — 2026-09-03

`--forms <file>` (CLI) and `forms:` (Action) take a config that names fields by their **accessible name**,
gives each a **value**, and names the control to press (ADR 0024). So it does two things `probeForms` does
not:

- **It enters text into fields.** `probeForms` only activates controls; a config types the values you
  wrote into the fields you named. Whatever you put in a config is what gets typed.
- **It presses a control you NAMED, not one a heuristic chose.** The `chooseProbe` word-match guard above
  does not apply, because it exists to decide what is safe to press when nobody said — and here somebody
  did.

**That is a deliberate widening of what this tool will do, and the consent moves with it.** `probeForms`'s
split is about who owns the page; a config is an explicit instruction naming exact fields, exact values
and an exact control, so it is honoured wherever it is supplied — CLI included, and with `probeForms`
still off. Where a config applies it REPLACES the opportunistic probe for that capture rather than running
beside it.

Three things follow, and the third is the one to read before pointing this at anything real:

- **Nothing is submitted that the config does not name.** A field it does not name is not filled; a
  control it does not name is not pressed.
- **A field the config names that cannot be addressed by its accessible name is reported as a FINDING
  about the page (4.1.2), never as a configuration error.** A control a script cannot address by name is
  one a screen reader user cannot address either.
- **DO NOT PUT REAL CREDENTIALS OR REAL PERSONAL DATA IN A FORMS CONFIG.** It is a file in your
  repository, it is read verbatim, and the values are typed into a live page and can appear in the
  capture transcript — because NVDA announces what a field contains, and that transcript is the evidence
  this tool reports on and stores. Use test values against a staging environment. The corpus's own
  configured page uses `ada@example.test`.

#### What else may be operated, and the line that decides it — 2026-09-01

4.1.3 asks whether a status message is announced. Buttons were the only control that could fire one here,
so a live region updated by a **checkbox** or a **radio button** was structurally unreachable: real
filters, consent toggles and "show prices including VAT" controls are checkboxes far more often than they
are buttons.

**Checkboxes and radio buttons are now operated too, under `probeForms` and nothing else.** The line is
not "how likely is this to be destructive" — that is a judgement about somebody else's code that we cannot
make — it is **can activating this control navigate away or leave the page under measurement**:

| | operated? | why |
|---|---|---|
| disclosure | yes, ungated | expanding is side-effect-free; this predates the rest and is the loosest rule here |
| button | yes, if submit-like or task-named | activation is its whole purpose, so the NAME has to carry the consent |
| **checkbox, radio button** | **yes, under `probeForms`** | toggling a form control is the archetypal act of using a page, and it cannot navigate |
| `<select>` / combo box | **already was, and this does not widen it** | see below — it announces as *collapsed*, so the disclosure rule has always caught it |
| link | no | activating one navigates away. `probeNavigation` is separately opt-in for exactly this |

**A combo box has been operated all along, and writing this section is what found that.** The first draft
of this table said selects were not activated, citing the jump-menu idiom. Running `probeKindFor` on a real
announcement refuted it in one line: NVDA announces a `<select>` as `"Sort by, combo box, collapsed"`, and
rule 1 matches `collapsed` — so it is activated **unconditionally, without even `probeForms`**, and has
been since that rule was written.

That is worth stating plainly rather than quietly correcting, because the exposure is real and predates
this decision. It is also **smaller than it looks, for a reason that is checkable**: the disclosure probe
presses **Enter**, and Enter does not change a `<select>`'s value — arrow keys do. The jump-menu idiom
fires on `change`. So the navigation risk needs a value change that this tool never performs.

This is the same fact `screenreader_features.py` already records from the evidence side — *"Enter is not a
combo box's activation; the evidence is identical to a broken disclosure's, character for character apart
from the role"* — which cost 3 false positives when it was left implicit, and 12 more when the state-change
rule reproduced it. Here it is the third time, in the safety gate: **the control that is hardest to
classify is the one three separate layers have now each had to learn about separately.**

Two things bound this and both are load-bearing:

- **It changes nothing on a stranger's site.** `probeForms` is off in the CLI, so this only widens what
  happens where the operator has already said they own the page. A widening inside an existing consent is
  a different decision from granting one.
- **It is strictly more conservative than the disclosure rule already shipped.** Disclosures are activated
  with no gate at all, on the reasoning that expanding is harmless — which is an assumption about author
  behaviour, not a guarantee. Toggling a checkbox behind `probeForms` assumes less.

We are not claiming a checkbox can never do something surprising; an `onchange` handler can do anything a
disclosure's can. The claim is narrower and checkable: **it cannot navigate**, and navigation is what
separates "we observed the page" from "we left it".

### The capture worker has no authentication, and binds all interfaces

The Windows worker that runs NVDA serves plain HTTP on port 8765 with **no authentication of any kind** and
no TLS. This is deliberate and documented (`packages/control/ansible/README.md`), and it is why the
fleet is managed over SSH rather than by adding routes to the worker: *a mutating route there would be
unauthenticated remote code execution on every box in the fleet.*

The consequence for you:

- **Run workers on a trusted network segment only.** Never expose port 8765 to the internet, and do not
  assume a cloud provider's default security group does the right thing.
- A worker will capture any URL it is handed, from anyone who can reach it. Treat network reachability as
  full authority over that machine's browser.
- `/diagnostics` returns process lists, disk usage, browser profile sizes and screen-reader logs.

### Some environment variables are executable

`A11Y_PYTHON` is read at five call sites and becomes the interpreter that is executed. Passing it is
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

### And it will not start collecting, deliberately

Recorded 2026-08-27 as a decision rather than an omission, because "we have not built telemetry yet" and
"we are not going to" look identical from outside and only one of them is a promise.

There is a real cost to that. Nobody knows how the shipped scorer behaves on a consumer's pages: it is
calibrated against 94 real pages from five publishers, and a page shape absent from that set could be
mis-scored systematically without anyone learning. Every published rubric for a production model asks for
exactly this feedback loop.

It is still the wrong trade here. This tool is aimed at pages behind an organisation's authentication, and
the transcript IS the page's text. A usage report that carried enough to be useful would carry that;
one stripped until it was safe would say nothing about the finding it came from. There is no version of
this that is both informative and honest about the promise above.

What bounds the risk instead, none of which requires a consumer to send anything:

- **The mapping.** A finding from the model carries no `mapping`, and `RequirementMapping` treats absent as
  `secondary` — so it becomes `cantTell`, a referral for a human, never an assertion. The layer that
  ASSERTS is the deterministic one, measured at 0 false positives across 1,183 conformant records. A model
  wrong about somebody's page produces a question, not an accusation.
- **The proxy population.** `calibrate-abstention` scores the real-page corpus through the product path and
  reports ASSERTED-WRONGLY separately from REFERRED, which is the number to watch.
- **The abstention floor.** A page outside the model's support is abstained on rather than guessed at.

If you want us to know how it behaved on your pages, an issue with the capture JSON is the route — a
deliberate act by someone who has read what they are sending, which is the only form of this that respects
the paragraph above.

## Scope

In scope: anything that lets a page under test escape the capture sandbox, escalate on a worker, or reach
the control plane; anything that causes a finding to be silently fabricated or suppressed.

Out of scope: the unauthenticated worker port itself (documented above, by design), and denial of service
against your own fleet.

## Credential handling

ADR 0012 splits the control plane along what each side must hold: the control container holds the fleet SSH
key, the lab container holds **no** key, and Wake-on-LAN needs no credential at all. No password is stored
anywhere in this project. If you find one committed, that is a vulnerability — report it.
