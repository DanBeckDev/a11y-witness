# Executive summaries, one per edition, written by hand

`<YYYY-MM-DD>.md` — at most **120 words**, answering exactly three things:

1. **Are we on the date?**
2. **What changed since yesterday?**
3. **What must the board decide today?**

**Write it before the edition renders, and write it yourself.** The generator refuses to render or post
an edition with no summary dated for that day, and the scheduled job records that refusal rather than
publishing a document without one. A missing summary is a missing edition.

## The 120 words are checked the EVENING you write it, not the morning it is due

The render-time gate reads **today's** summary. A summary written the night before is therefore the one
nothing checks until the morning it is published — so an over-length one sits looking fine all night and
refuses the edition at 08:00, when nobody is awake to cut two words.

**`board:summary-check` counts it at 21:00 and fails if it is over**, which is the moment somebody can
still act. Found by writing a 122-word summary and watching every check pass.

## The dateline is for when nobody is there, not a licence

A summary is written at **07:30 London on the morning of its edition**, and it says so in its own first
line: **"Written at 07:30 on 8 September."**

**The board asked for this directly:** *"it should be 30 mins before as it should be as fresh as possible
as a lot happens over night."* A summary written the evening before is a forecast about a night that has
not happened. On 8 September the queue went from twelve open pull requests to zero between the summary
being written and the edition rendering, and the forecast opening — *"if the overnight run changes the
answer, rewrite it"* — was an instruction to a person who would not be there.

The stated time is **checked, not decorative**: `statedWritingTime` in `board-summary-check.mjs` is
asserted by the style suite to be within 60 minutes of the render. A stated time nothing verifies is the
same shape as a gate that reports cleanly having examined nothing.

The schedule around it: **07:15** a reminder that exits 0 (at 07:15 the summary is not late, it is not
written yet, and a red mark every morning for a normal working state is how a signal gets ignored);
**07:45** a refusal; **08:00** the edition, reading `main` as it stands then, so anything landed overnight
is in.
running before 08:00, re-read the overnight outcome and rewrite the file if it changed the answer.** The
dateline exists for the mornings when nobody is awake to do that; it is not an excuse for a summary that
was overtaken and left standing.

The test is whether the sections below it would contradict it. The sections are read at render time and
the summary is not, so they are the thing that moves — a summary the document disagrees with is worse than
a summary written late.

**Do NOT restate a number the document computes.** The summary is written by hand, minutes or hours
before the edition renders, and the document's counts are read at render time — so a count typed here goes
stale in between. It happened on the first day: the summary said *eight pieces of work remain* and the
rendered document said seven, because a blocker closed after the summary was written. Say *one of the
remaining items has no known size*, not *one of eight*. Dates and decisions are safe; counts are not.

**It is not assembled from the sections below it.** A summary generated from the body is the thing the
chairman's third rule forbids, and it would also be useless: the summary exists to say what the sections
cannot, which is what a reader should do about them today.
