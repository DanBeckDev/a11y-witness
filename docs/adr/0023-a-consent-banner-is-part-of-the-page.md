# 0023 — A consent banner is part of the page, and the capture must say so

**Status:** accepted, 2026-08-29
**Closes:** `docs/capture-integrity-plan.md` C4

## Context

Over half the real-page corpus opens behind a consent banner — measured at **55% of 106 captures**. Until
now that was invisible to every rule: a capture of "the page" was a capture of the banner plus whatever
happened to be reachable behind it, and a finding could not tell a reader which of those it described.

Three coherent answers were available, and the project had none of them written down.

| | |
|---|---|
| **capture it as it is** | honest — this IS what a first-time visitor meets. Then a finding must SAY so, and "no headings" means "no headings reachable past the banner" |
| **dismiss it and capture the page** | what a returning visitor sees |
| **capture both** | the truthful answer and twice the cost; it also makes the banner itself assessable |

## Decision

**Capture the page as it is, and RECORD that the banner was there.**

Dismissing is refused on the project's own existing rule, not on a new one. `probeForms` defaults ON in
the GitHub Action and OFF in the CLI, and the reason given is that "pressing *Book* on a stranger's site
is not a review". Clicking *Accept all* is a stronger version of the same act: it is consenting to
tracking on behalf of a visitor who does not exist, on a site the operator may not own. A tool that can
be aimed at any URL must not do that.

Capturing both is not refused on principle — it is the most truthful answer and remains the right change
if the banner itself becomes a target of assessment. It doubles a corpus run that already costs ~4 hours,
and it buys nothing until the recording below exists, because without that a reader still cannot tell the
two captures apart.

## What follows, and it is the half that was actually missing

The banner was never the defect. **A finding that could not say which page it described was.**

`consentBanner()` reports two things that must never be merged:

- **`present`** — the opening announcements mention consent. Context, and cheap: nearly every UK
  government site.
- **`blocking`** — focus never left it. A defect, and it invalidates the capture's claims about the page.

Merging those is a mistake this project has already made and paid for: a metric once reported *"50 of 86
captures read the site's furniture"* by combining "has a cookie banner" with "never got past one". The
first was almost every site and cost nothing; the second was **one page** and invalidated everything
downstream. One number, two populations, opposite responses.

A `blocking` banner therefore outranks every per-type completeness verdict in `captureSupports`: if focus
never escaped the dialog, the sweep is a complete and accurate account of the BANNER, and "this page has
no headings" is a statement about a dialog. **An exact sweep of the wrong thing is the most confident way
to be wrong.**

## Consequences

- Findings derived from a capture that opened on a banner can be qualified rather than silently wrong.
- `capture:explain` reports it from the same function the rules read — one definition, because a regex in
  the reporting tool and another in the rules is the "fact stated twice" defect that cost five incidents
  in a single day.
- **This does not change what any evidence MEANS**, so it does not bump `CAPTURE_PROTOCOL_VERSION`. It
  reads the transcript and a mark that captures already carry.
- If the banner itself becomes a subject of assessment, revisit "capture both". That is a real
  accessibility question and this decision does not answer it — it only stops us pretending the banner
  is not there.
