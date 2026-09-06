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
          url: https://your-app.example/the-page-you-care-about
          task: Complete the checkout
```

**`task` is load-bearing.** It is what a user is trying to *do*, in plain words, and it changes what gets
captured: a button whose announced name shares a meaningful word with the task gets activated, and
whatever the screen reader says next is recorded. The word match is the safety guard — *"show only bags"*
activates a **Bags** button and never a **Delete account** one.

Pick a page that **does something**: a form, a filter, a multi-step flow. A static content page exercises
almost none of what this layer is for.

Expect the run to take a few minutes. Most of it is the screen reader reading, and that time is not
recoverable.

## What we would like back

Four questions, and short answers are better than considered ones:

1. **Did you believe the findings?** For any you did not, the announcement is quoted — was the quote
   wrong, or was our reading of it wrong?
2. **Did it tell you anything your existing scanner had not?**
3. **Was it worth the minutes it cost**, on a page you actually care about?
4. **Where did you get stuck?** Every question you had to ask us is a defect in this page.

Open an issue, or reply to whoever sent you here. **A blunt "no" with a reason is worth more to us than a
polite yes.**

## Things you may reasonably want to know

**Does it send anything anywhere?** No. The tool talks to the page you point it at and the machine running
it, and nothing else. No telemetry, no usage reporting, no call home, and no plan to add any.

**How accurate is it?** On our own corpus of 1,398 conformant records the deterministic rules asserted no
failures. That is a measurement of our corpus, not a claim about the web — which is exactly the gap your
run helps close.

**Is it a conformance certificate?** No. It is evidence about specific criteria on specific pages.
