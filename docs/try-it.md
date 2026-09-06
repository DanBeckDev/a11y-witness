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
- **Nothing is published to npm yet.** You install from the repository.

## The fastest route: a GitHub Actions run

If your app is on GitHub, this needs one workflow file and no machine of your own.

```yaml
jobs:
  a11y-witness:
    runs-on: windows-2022        # NVDA is Windows-only; the action fails fast anywhere else
    steps:
      - uses: DanBeckDev/a11y-witness@main
        with:
          url: https://your-site.example/the-page
          task: Send an enquiry
```

**`task` is load-bearing.** It is what a user is trying to *do*, in plain words, and it changes what gets
captured: a button whose announced name shares a meaningful word with the task gets activated, and
whatever the screen reader says next is recorded. The word match is the safety guard — *"show only bags"*
activates a **Bags** button and never a **Delete account** one.

**Point it at the page with your contact form on it.** A long page with a form exercises far more of this
layer than a page of text alone — the form is where the announcements this tool exists to hear actually
happen.

Expect the run to take a few minutes. Most of it is the screen reader reading, and that time is not
recoverable.

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
captures opened on a consent overlay and never reached a heading.

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

**Expect minutes, not seconds.** A capture is around a minute on an ordinary page and a long page is
longer, because the time is a screen reader reading — it is not parallelisable and not recoverable. A very
large page can exhaust our capture budget, and if it does you will get a partial result that **says** it
is partial rather than a short one that looks complete.

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

**How accurate is it?** On our own corpus of 1,398 conformant records the deterministic rules asserted no
failures. That is a measurement of our corpus, not a claim about the web — which is exactly the gap your
run helps close.

**Is it a conformance certificate?** No. It is evidence about specific criteria on specific pages.
