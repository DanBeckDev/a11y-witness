# Try it in two hours

You already run an automated accessibility scanner in CI. This is a second layer that answers a different
question, and this page is the shortest honest path to finding out whether it is worth your time.

**We want your reaction, not a bug list.** If the output is not worth the minutes, that is the most
useful thing you can tell us, and it is the answer we have no other way of getting.

## What this finds that your scanner does not

Your scanner reads the markup. This drives **a real screen reader — NVDA, on Windows — through the page**
and records what it actually said.

That reaches failures markup cannot express, because they are about a *moment* rather than a state:

- a skip link that is present, correct-looking, and **inert**;
- a route change where the page updates and **the title does not**, so a screen reader user is told
  nothing about where they now are;
- a filter or form control that changes the page and **announces nothing**;
- a tab order that **contradicts the reading order** — the DOM has no reading order to contradict until
  something walks the page.

Every finding quotes the announcement it rests on. When we say a control is unnamed, the report shows you
the words NVDA spoke.

## What it will not do, stated up front

- **It does not replace your scanner.** It covers a handful of criteria deeply; yours covers many
  shallowly. Run both.
- **Most of what it reports is a referral, not an accusation.** The deterministic rules assert; the
  trained component only ever says *this is worth a person's look*. A referral on a page you believe is
  fine is expected behaviour, not a bug.
- **It needs Windows**, because NVDA is Windows-only. That is the real cost of the two hours.
- **Nothing is published to npm yet.** You install from the repository — [the commands are below](#the-other-route-run-it-from-the-repository), and `npx a11ign` will not work yet.

## The fastest route: a GitHub Actions run

If your app is on GitHub, this needs one workflow file and no machine of your own.

```yaml
jobs:
  a11ign:
    runs-on: windows-2022        # NVDA is Windows-only; the action fails fast anywhere else
    permissions:
      pull-requests: write       # for the PR comment below; omit it and the report still runs, only quieter
    steps:
      - uses: actions/checkout@v4
      - uses: DanBeckDev/a11y-witness@main
        with:
          url: https://your-site.example/the-page
          task: Send an enquiry
```

**`task` is load-bearing.** It is what a user is trying to *do*, in plain words, and it changes what gets
captured: a button whose announced name shares a meaningful word with the task gets activated, and
whatever the screen reader says next is recorded. The word match is the safety guard — *"show only bags"*
activates a **Bags** button and never a **Delete account** one. That is all it does on this shipped
default — see [the README's "Using it"](../README.md#using-it) for why a well-chosen task does not also
sharpen the verdict.

**Don't have a page picked yet?** Point it at `https://www.w3.org/WAI` — the W3C's own accessibility
site — for a first look before choosing anything of your own. We have already run it there
([`docs/github-action.md`](./github-action.md#tested-against-real-sites-in-the-wild)): 143 announcements,
zero findings, and not marginally — a false positive on the W3C's own site would have been damning, so
that is a real, meaningful result rather than an untested placeholder. It is a safe page to point either
the CLI or the Action at: informational, nothing to submit, so a `task` about learning something on the
page (`"Learn about web accessibility"`) is enough — no contact form, no risk of pressing anything real.

**Once you have seen real output, point it at the page with your contact form on it.** A long page with a
form exercises far more of this layer than a page of text alone — the form is where the announcements
this tool exists to hear actually happen.

<!-- WHY THE MARKERS BELOW EXIST (#1060): this page promised a floor and then cited two figures under
     it in the same sentence, calling them "within a few percent of each other" when the spread was
     seventy per cent. The markers make the checked population explicit. Nothing explanatory goes
     INSIDE them: a range named in a sentence about the old range is exactly what a text check cannot
     tell from the claim itself. Figures quoted outside the block are deliberately not held to the
     range, which is what lets the consent-banner failure be quoted as the failure it is. -->

<!-- TIMING:BEGIN -->

**Expect four to eight minutes for a real page.** Measured on five real-page runs that reached the page
(#311, #915): 4 m 38 s, 4 m 50 s, 5 m 48 s, 7 m 52 s and 7 m 54 s. **There is a floor — the fastest run that
reached the page was 4 m 38 s — and above it the spread is wide:** the slowest of the five is seventy per
cent longer than the fastest, so a simpler page does not reliably mean a shorter run, and the range is a
bound rather than a prediction for your page. Most of it is the screen reader reading, and
that time is not parallelisable or recoverable.

<!-- TIMING:END -->

**A sixth run took 3 m 45 s and that is not a faster run, it is a failed one** — it opened on a consent
overlay and read almost none of the page. **Under four minutes is a finding, not a success**; see the
consent-banner section below before you judge how long your own run took.

## The other route: run it from the repository

**Use this if your app is not on GitHub, or you want to see the output before you commit a workflow file.**
It is the same tool; the difference is where the Windows machine comes from. **`npx a11ign` does not work
yet** — nothing is published — so the package comes from a clone.

```bash
git clone https://github.com/DanBeckDev/a11y-witness.git
cd a11y-witness
npm install
npm run witness -- https://www.w3.org/WAI --task "Learn about web accessibility"
```

Node 20 or later. `npm install` builds the workspace, so there is no separate build step.

**The last command needs a capture worker and will not invent one.** A screen reader is a Windows desktop
application: there is no Docker image, and no flag substitutes for the machine. Run on a Mac or Linux box
with nothing configured, this is exactly what you get — quoted rather than paraphrased, because it is the
most likely first result and it is not a crash:

```
No capture worker answered at http://localhost:8765 (nothing was configured, so this address was a guess).
A screen reader is a Windows application, so nothing runs here without one. Set A11Y_WORKER to point at a
worker you have, or see docs/getting-started.md to set one up (~20 minutes with a Windows machine already,
or use the GitHub Action if you have none).
```

**Three ways past it, cheapest first:**

| you have | do this |
|---|---|
| a GitHub repo | **[the Action above](#the-fastest-route-a-github-actions-run)** — a GitHub-hosted Windows runner is the worker, and you configure nothing |
| a Windows machine already | [`docs/getting-started.md`](./getting-started.md) — about twenty minutes, then `A11Y_WORKER=http://<that-machine>:8765` |
| neither | a Windows VM, 1.5–2 hours from scratch. **Take the Action instead** unless you specifically want the local path |

`npm run doctor` reports what this machine has and what each gap needs. It is read-only — it never starts
or stops anything — so it is safe to run before you have decided anything.

**`--probe-forms` is off here and on in the Action, and that is deliberate.** The CLI can be pointed at any
URL, and pressing *Send* on somebody else's production site is not a review. A workflow runs against your
own app, where submitting is intended.

## What a long marketing page will actually produce

Your page is one large page with many images, links and headings, and probably a contact form and a
consent banner. Here is what to expect from that shape, so nothing in the output is a surprise.

**Read the cookie banner warning first — it is the one thing that can waste the whole run.**

### The consent banner is the real risk, and you can check for it in ten seconds

**A screen reader that opens on a consent overlay can see the overlay and nothing else.** Measured on our
own test page: with the banner in the way, headings went 5 → 0, links 6 → 1, graphics 1 → 0. The page
simply vanished.

We handle it — the tool reads the page structure before anything can trap focus, and it presses Escape,
which dismisses most banners. **It does not always work.** On a batch of real public-sector pages, 24
captures opened on a consent overlay and never reached a heading. In one real run (#398) the page this
guide recommends pointing at — your own contact-form page — returned nothing but a consent-overlay
warning, after the full five minutes: the judgement was correct (it genuinely could not get past the
banner), but that is the worst-case shape the timing range above does not cover, and it is why the check
below matters more than the number.

**So check one thing before you judge the output:** if the report shows almost nothing — a handful of
elements on a page you know is large — you are looking at the banner, not at your site. Tell us; that is a
defect in our tool, not in your page. Running against a URL that skips the banner (a staging build, or a
page reached with the cookie already set) will also work.

### What is likely to appear, and which of it is a claim

| what your page has | what you may see | is it a claim? |
|---|---|---|
| Many images | **Missing alt text**, and **alt text that is a filename** | **Yes — asserted.** Both are read directly from what the screen reader said |
| *Learn more* / *Read more* links | Link purpose unclear from the text alone | **No — a referral.** It means *a person should look*, not *this is broken* |
| Unnamed graphics inside links or buttons | A control with no accessible name | **Yes — asserted**, when nothing names it |
| Headings | Heading structure, and whether headings and labels describe their content | Mixed — some asserted, some referred |
| A contact form | Error messages that are never announced; a status message nobody hears | **Only if you use the GitHub Action with a `task`** — see below |

**Referrals will outnumber assertions, and that is the design rather than hedging.** A referral on *learn
more* is the tool saying it cannot tell from the announcement alone whether the surrounding context makes
the link clear — which is exactly the judgement a person makes in a second and a scanner cannot make at
all.

### The contact form needs one thing from you

The command-line tool **never submits a form on a page it does not own** — pressing *Send* on somebody's
production site is not a review. The GitHub Action does, because you own the app, **and only when you give
it a `task`**. If you want the form assessed, say what a visitor is trying to do (*"Send an enquiry"*) and
point the run at the page with the form on it.

### How long a large page takes

**Expect four to eight minutes**, per the measurement above (#311, #915) — the floor is fixed regardless
of shape, because the time is a screen reader reading and that is not parallelisable or recoverable. The
range above it is not: the slowest measured run is seventy per cent longer than the fastest. A very large page can still exhaust our capture budget beyond that
range, and if it does you will get a partial result that **says** it is partial rather than a short one
that looks complete.

## YOUR PAGE — the one section that is not written yet

**Everything above is the path for the shape of page you have: one large marketing page, many images and
links, a contact form, probably a consent banner. It is complete and you can follow it today.**

This section is deliberately blank, and it is the only part of this page that is. It gets filled in when
we have your URL, and it will hold three things nobody can write without it:

- **The exact workflow file for your page**, with your URL and the `task` a visitor on it is actually
  trying to do — not `Send an enquiry` as a placeholder, but the words that match a control on your page.
- **Whether your page has a consent banner in the way**, checked before you spend the minutes. This is
  the single thing most likely to waste the run, and it takes us one capture to answer.
- **What your run actually produced, read alongside you** — which findings are assertions, which are
  referrals, and which of the referrals were worth your attention. That last judgement is the one we are
  asking you for, and it is easier to make with somebody who can point at the announcement each one rests
  on.

**Why it is empty rather than filled with an example.** A worked example against a site we chose would
read as though the path had been walked, and it has not — not by anyone outside this project, which is
the entire point of #38. **An empty section that says what goes in it is honest; a plausible example is
not.**

**Nothing above depends on this.** If you would rather just run it, the GitHub Actions route needs your
URL and one line of `task`, and you will get a report.

## What we would like back

Four questions, and short answers are better than considered ones:

1. **Did the run see your page, or did it see the cookie banner?** The quickest tell is whether the
   element counts look like your page at all.
2. **Did you believe the findings?** For any you did not, the announcement is quoted — was the quote
   wrong, or was our reading of it wrong?
3. **Were the referrals worth reading, or noise?** They will outnumber the assertions. If *learn more*
   showing up thirty times is not useful, say so — that is a product decision we would rather make on
   your reaction than on our own taste.
4. **Was it worth the minutes it cost**, and did it tell you anything your existing scanner had not?

And, whenever it happens: **where did you get stuck?** Every question you had to ask us is a defect in
this page.

Open an issue, or reply to whoever sent you here. **A blunt "no" with a reason is worth more to us than a
polite yes.**

## Things you may reasonably want to know

**Does it send anything anywhere?** No. The tool talks to the page you point it at and the machine running
it, and nothing else. No telemetry, no usage reporting, no call home, and no plan to add any.

**How accurate is it?**

<!-- CLAIM:BEGIN -- checked by public-claim.test.ts against a gate result recorded in
     docs/board/reported/, exactly as the README's claim block is. This figure lived here as a
     SECOND COPY for a while and went stale when the first one moved; that is why the markers exist. -->

**On our own corpus of 1,405 conformant records the deterministic rules asserted no failures.** The real-page figure is under re-measurement since 2026-09-06 and this page states none: a refreshed baseline produced four findings on pages an older baseline had passed, and until each is established as an assertion or a referral there is no honest number to give.

<!-- CLAIM:END -->

Both are measurements of pages **we** chose, not a claim about the web — which is exactly the gap your run
helps close. Your page is one we did not choose, which is the whole reason we are asking.

**Is it a conformance certificate?** No. It is evidence about specific criteria on specific pages.
