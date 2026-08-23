# ADR 0016 — Publish the screen-reader evidence, not the pages, and not the synthetic corpus

**Status:** accepted, 2026-08-23
**Depends on:** ADR 0010 (the real-page calibration corpus this publishes), ADR 0004 (package boundaries and licences)
**Supersedes a one-line intent:** `docs/control-plane-proxmox.md` has said *"the publishable artifact is external-page evidence instead; see ADR 0010"* since the corpus repo was made private. ADR 0010 builds that corpus and says nothing about publishing it — no licence, no format, no location. So the intent has been recorded and unimplemented. This is the decision it was pointing at.

## Context

There are **two** corpora in this project and only one was ever meant to be public. Conflating them is the
mistake this ADR exists to prevent, because the two arguments point in opposite directions.

| | synthetic corpus | real-page corpus |
|---|---|---|
| what it is | our own generated good/bad page pairs, and their captures | NVDA evidence from pages whose publisher states its own conformance |
| size | 1,303 cases / 2,122 captures | 77 pages defined, **26 captured** |
| where | `git@github.com:DanBeckDev/a11y-corpus` — **private** | `runs/real-page-corpus`, gitignored, unpublished |
| decision | **stays private, permanently** | **publish** |

**The synthetic corpus must stay private, and the reason is not commercial.** Those pages *are* the
validation set. Publishing them puts them in the next scrape, and a benchmark that has been trained on
measures nothing. The same reasoning already governs `contamination-test.html`, which `README.md` describes
as "authored fresh and never published" precisely so it can serve as a held-out case. A public validation
set is a spent one.

None of that applies to the real-page corpus, which is the opposite artifact: pages *already* public, whose
labels come from **the publisher's own statement rather than our judgement**.

### What a record actually contains — the copyright question does not arise

Checked against all 28 files on disk: **no field holds page markup.** A record is

```
url                 https://www.w3.org/WAI/demos/bad/after/news.html
publishedClaim      conformant | inaccessible          <- the publisher's word, not ours
claimSource         "W3C publishes the Before/After Demo 'after' pages as conforming to WCAG 2.0 AA (<url>)"
demonstrates        "single-line text field with label and hint"
role                training | calibration
capture.transcript  145 phrases of what NVDA SAID
capture.structure   the headings/links/graphics/lists census
capture.interaction disclosure and focus-order probes
capture.diagnostics 38 timing and remedy marks
capture.environment NVDA, browser and browser version, OS build, architecture
```

Nothing is mirrored, cached or rehosted. What is published is **an observation of a public URL** — the
text a screen reader spoke — alongside a citation of what its publisher already says about it. This is the
same category as a link check or a page-speed measurement, and the pages remain the publisher's to change or
withdraw.

That is also the reason this is worth publishing rather than merely permissible. **Nobody has published
this.** Rule scanners publish rule results; this is what a screen reader actually announced, on named real
pages, with the publisher's own conformance claim attached.

### Where the labels come from, and why they are unusually good

41 publishers, and the shape is not an accident:

| | pages |
|---|---|
| `www.w3.org` (WAI demos, tutorials, BAD before/after) | 26 |
| `design-system.service.gov.uk` | 12 |
| 39 further UK public-sector bodies — gov.uk, NHS, TfL, ONS, Ofsted, ICO, National Archives, four universities, several councils | 1 each |

UK public-sector bodies are **required by the Public Sector Bodies (Websites and Mobile Applications)
Accessibility Regulations 2018 to publish an accessibility statement**, and that statement is the label.
So the ground truth is a legal obligation discharged by the publisher, not an annotation we produced — which
is exactly the property that makes a corpus usable by someone who does not trust us.

## Decision

**Publish the real-page evidence as a versioned dataset, separate from both code repos.**

1. **Content**: one JSON record per page, exactly the shape above — URL, publisher claim, claim citation,
   full NVDA transcript, structural census, probe results, and the capture environment. No markup, no
   screenshots, no page mirror.
2. **Licence: CC BY 4.0**, not the code's AGPL. Copyleft on a dataset discourages exactly the reuse this
   exists for, and attribution is the only condition worth imposing. `packages/evidence` is already
   Apache-2.0 for the same reason — the interop layer is meant to be adopted, not defended.
3. **Environment is part of the record, never stripped.** `browserVersion`, `guidepupVersion`, the Windows
   build and `provisionRevision` are already capture-cache keys because evidence taken under one Edge build
   is not interchangeable with another's. A consumer needs that for the same reason we do; a dataset that
   drops it invites exactly the blending the key exists to prevent.
4. **Ship the abstentions and the cantTells.** The scorer abstains on real pages (ADR 0010) and the outcome
   model has five values for a reason. A dataset carrying only findings would misrepresent the tool and be
   less useful: "a screen reader announced this and no conclusion could be drawn" is a datum.
5. **Its own repo, versioned like the private one.** A capture is not reproducible — recapturing after an
   Edge update yields a *different* corpus, and `git diff` over pretty-printed JSON shows which announcements
   moved between recaptures, which is a research capability rather than just recovery.

## What must be true before it ships

> ### Corrected 2026-08-23, the same day this was written — the coverage table below was WRONG
>
> This ADR originally said 26 pages captured from 1 publisher, and planned a capture run to close the gap.
> **The corpus was already complete: 77 pages from 41 publishers, captured 2026-08-20.** The figures came
> from `runs/real-page-corpus` on a laptop; `runs/` is gitignored, so a local copy is only ever as fresh as
> its last sync, and that one was three days stale. The lab — the box that actually produces captures — had
> all 77 the whole time.
>
> | | defined | captured (measured on the LAB) |
> |---|---|---|
> | pages | 77 | **77** |
> | publishers | 41 | **41** |
> | claimed conformant / inaccessible | 74 / 3 | **74 / 3** |
> | training / calibration | 55 / 22 | **55 / 22** |
>
> **The rule this earns: any figure quoted about the corpus comes from the lab, never from a working copy.**
> The same mistake had already been made an hour earlier against the synthetic corpus — `check-signals`
> reported 860 stale locally and 0 on the lab at the same commit — so this is a repeated error, not a slip,
> and it produced a published document stating a number that was never true. `check-signals` now prints
> both readings and names the command that settles it; this ADR is the record of what happens when it does
> not.
>
> What survives the correction is the part that matters, and it is unchanged: **3 of 77 pages carry a
> publisher-declared *inaccessible*.** That is the real gap, it is the one ADR 0010 already named as "the
> single highest-value addition to this corpus", and no amount of capturing fixes it — it needs more pages
> whose publisher says they fail.

**The gap is not coverage, and it is not permission. It is the balance of labels.**

- **74 of 77 pages are claimed conformant.** A dataset that is 96% positives supports "here is what a
  screen reader announces on pages their publishers call compliant" — which is genuinely publishable and
  genuinely novel — but it cannot support a claim about detecting real failures.
- **More publisher-declared *inaccessible* pages** is therefore the one thing standing between this and a
  balanced corpus. Three negatives, all from one publisher's teaching material (W3C's BAD demo), cannot
  carry that weight.
- Say so in the dataset's title and README rather than letting a consumer infer a balance that is not
  there.

Two limits belong **in the dataset's own README**, not just here, because a consumer will otherwise infer
them wrongly:

- **3.3.1 and 4.1.3 are unwitnessable on real pages** (`UNWITNESSABLE_ON_REAL_PAGES`). `probeForms` is off
  against sites we do not own — pressing *Book* on a stranger's page is not a review — so those criteria are
  structurally unreachable here. Their absence is a property of the method, not of the pages.
- **A published claim is a claim.** `publishedClaim: conformant` means the publisher says so. Several of
  these pages will have real failures; that mismatch is a legitimate research subject and must not be
  presented as a verified label.

## Consequences

- Someone can reproduce or dispute any assessment we publish, because the evidence underneath it is public
  and the pages are named. That is a stronger claim than an accuracy number, and this project has no expert
  baseline to quote instead (`docs/METHODOLOGY.md`).
- It gives the screen-reader-behaviour question a public answer. `evidence:check --browser=chrome` asks
  whether NVDA announces the same thing in two Chromium browsers, and the Edge corpus is the baseline that
  makes it a one-command question. Publishing the baseline makes it everyone's question.
- **It commits us to recapturing.** A published dataset whose environment is two Edge builds stale is worse
  than none, so this adds a standing obligation the private corpus does not have.
- It is a marketing asset that is simply true — an artifact nobody else has, licensed for reuse, and the
  honest limits above are part of what makes it credible rather than a caveat to be buried.

## What would falsify this

- **If publishers object to being named**, the premise is wrong. The mitigation is not anonymisation — an
  anonymous URL is not evidence — but restricting to publishers whose statement invites scrutiny.
- **If the transcripts turn out to be reconstructible into page content** in some way not anticipated here,
  the copyright reasoning above needs revisiting. A structural census plus 145 spoken phrases is not markup,
  but this is the assumption to test rather than assume.
- **If the negatives never materialise** — if publisher-declared inaccessible pages remain unfindable at
  scale — then this is a conformant-page dataset, and it should say so in its title rather than imply a
  balance it does not have.
