# What NVDA settings could buy us

**Asked 2026-09-03, after `reportLanguage` turned out to unlock a criterion this project had recorded as
out of reach.** If one default was hiding evidence, others might be.

## How this audit is framed, and why not the other way

**Demand-side.** The tempting version is to enumerate NVDA's settings and ask what each might do. That
produces a vendor's feature list with our questions bolted on, and this repo has already paid for scope
taken that way — `CONTROL_ROLES` gained two spellings on 2026-09-02 and deliberately NOT the six other
real NVDA roles that occur zero times in the corpus, because *"over-inclusion is silent"*.

So this starts from **what this tool cannot currently hear** — the seven gaps in *"What It Cannot Hear"*,
each measured rather than assumed — and asks which settings bear on each.

**Every row says whether it is VERIFIED or a HYPOTHESIS, and no row asserts a mechanism.** The immediate
cause of this audit was me citing a mechanism that had been refuted twice.

## What was verified, and how

`guidepup` exposes **160 NVDA commands**. Read off the package, not from memory:

| command | in the worker? |
|---|---|
| `moveToNextFrame`, `moveToPreviousFrame` | **used** — iframes are covered |
| `reportTextFormatting` | used — this is 3.1.2's route |
| `speakTypedCharacters`, `speakTypedWords` | **never called** |
| `reportDynamicContentChanges` | **never called** |
| `punctuationLevel` | **never called** |

---

## The audit

### 1. Live regions — the biggest prize, and no setting is known to fix it

**The gap:** a live region reaches the capture **2 times in 6** on an unchanged page. It costs items 3
and 6, keeps two corpus cases withdrawn, and is the largest single hole in 4.1.3.

**What is NOT the answer, both refuted by measurement rather than argument:**

- *"Polite means speak when idle, and NVDA is never idle"* — refuted by a diagnostic pair where a `polite`
  and an `assertive` region on the same checkbox **both announced**.
- *"The settle window loses a race"* — the fix was built, deployed and re-measured. The rate did not move.

**Candidate settings, all HYPOTHESES:**

| setting | why it might bear on it | why it might not |
|---|---|---|
| **speech rate** | rate changes the timing of everything NVDA does, and could still explain a residual | the settle-window fix already tested a timing explanation and failed |
| `reportDynamicContentChanges` | never called by this worker | almost certainly already ON — regions *do* announce 2 times in 6, which they could not if this were off |

> **STALE UNTIL 2026-09-06: this said "the intermittency is unexplained, and `not-working.md` §18 says
> so."** That described an earlier §18; the CURRENT §18 (`not-working.md`, "MEASURED IN FULL — every cell
> is a rate") characterises the mechanism directly — it is NVDA's politeness semantics working as specified,
> not an unexplained residual, and a full rate table is given per trigger and per politeness level. Speech
> rate remains untested and worth the one experiment, but not because the intermittency has no explanation
> any more; it is a plausible variable in a mechanism that IS now characterised.

### 2. Typing feedback — `speakTypedCharacters` is real and never called

**The gap:** item 6. Live validation while typing.

`speakTypedCharacters` and `speakTypedWords` are guidepup commands this worker has never called, and both
have `nvda.ini` equivalents under `[keyboard]`.

**But the measured blocker is the corpus, not the setting.** `oninput` appears on **0 of 3,948 generated
pages** — live validation while typing does not exist in this corpus at all. A probe built now would have
nothing to observe, which is why §17 says the first step is a case rather than a probe.

**So: not a setting fix.** Recorded because "there is a command for it" is exactly the reasoning that
would send someone to build the probe first.

### 3. Punctuation and symbol level — the one that could QUIETLY change everything

`punctuationLevel` is never called, and NVDA's default is `some`.

**This one deserves attention precisely because it is not a gap.** It changes how NVDA speaks symbols in
every announcement — and this project has already been bitten twice by characters in announcements:
U+FFFC from Edge's autofill, and U+E604 from an icon font, each of which made a name fail to match
itself.

A different punctuation level would change announcement text corpus-wide. That makes it a **risk to
understand rather than an optimisation to take**: nobody should change it without `evidence:check`, and
now that `screenReaderSettings` is in the cache key, changing it can no longer blend two corpora silently.

### 4. NVDA's real defaults — READ, 2026-09-03

`/diagnostics.screenReaderDefaults` reads `configSpec.py` out of NVDA's `library.zip` on the guest. Not
from memory, and not from the vendor's docs: from the build the fleet is running.

`documentFormatting` — **18 default ON, 15 default OFF.** The ON list is why the sweeps work at all, and
until this was read it was assumed:

```
ON   reportBlockQuotes  reportBookmarks  reportClickable  reportComments  reportFigures
     reportFrames  reportGraphics  reportGroupings  reportHeadings  reportHighlight
     reportLandmarks  reportLinkType  reportLinks  reportLists  reportPage
     reportRevisions  reportTableCellCoords  reportTables

OFF  detectFormatAfterCursor  ignoreBlankLinesForRLI  includeLayoutTables  reportAlignment
     reportArticles  reportColor  reportEmphasis  reportFontName  reportFontSize
     reportLineNumber  reportLineSpacing  reportParagraphIndentation  reportStyle
     reportSuperscriptsAndSubscripts  reportTransparentColor
```

**Of the fifteen OFF, four bear on a criterion this tool owns.** The rest are typographic detail with no
WCAG question behind them, and listing them as candidates would be the vendor-catalogue mistake this
audit was framed to avoid.

| setting | the criterion | what it would carry |
|---|---|---|
| ~~`reportEmphasis`~~ | ~~1.3.1~~ | **REFUTED 2026-09-03 — [known-gaps §33](./known-gaps.md).** It was this table's strongest candidate, and it cannot work here: NVDA implements emphasis reporting only for the **MSHTML** engine (IE, or Edge in IE mode), and this project captures in Chromium Edge. Built, deployed and captured; `check-signals` reported the case CONTAMINATED because NVDA said "emphasised" on neither variant. **The audit could not have known this without testing** — it rated the candidate on what the setting is FOR, not on whether our browser supports it |
| `includeLayoutTables` | **1.3.1** | NVDA SKIPS layout tables by default, so the table sweep cannot see them at all. Relevant to the existing 1.3.1 table work, which has already cost a protocol bump |
| `reportSuperscriptsAndSubscripts` | 1.3.1 | superscript carries meaning — footnotes, ordinals, notation |
| `reportColor` | 1.4.1 | weaker than it looks. 1.4.1 asks whether colour is the ONLY cue, and hearing a colour does not answer that. It is also the visual layer's territory |

> **NONE OF THESE SHOULD BE TURNED ON YET, and the reason is §17's rule pointed at settings.** Each adds
> text to every announcement that carries the property, corpus-wide. A setting turned on with no rule
> reading it and no case exercising it is noise in 2,488 records — the capability arriving before anything
> to observe with it, which is exactly what happened with `reportLanguage` and is now its own backlog row.
>
> The order is: a corpus case, then a rule, then the setting.

**And `speech` answered a question nobody had asked.** `autoLanguageSwitching` is **ON** by default —
which is what makes NVDA change VOICE on a language change — while `reportLanguage` is **OFF**. That pair
is the whole of why 3.1.2 was silent: NVDA was switching languages all along and saying nothing about it.

### 5. Speed as speed — untested, and not free

Faster speech plausibly shortens captures. It is **not** a free optimisation, for the reason above: it
acts on what is heard, so it is keyed evidence.

There is also a specific reason to be careful. guidepup's `SPEAK_DEBOUNCE_TIMEOUT` and
`CANCEL_NOT_FIRE_TIMEOUT` are both **1000 ms**, and CLAUDE.md already records that *"a vCPU descheduled
past one second loses the phrase"*. Changing speech timing near a fixed 1-second bound is exactly where a
lost phrase becomes indistinguishable from a silent page — the fault this project has spent the most time
on.

---

## What should actually happen next, in order

1. ~~**Read NVDA's `configSpec.py` on a guest.**~~ **DONE 2026-09-03** — §4 above carries the result, and
   it immediately found that `reportLanguage` had been written to the wrong section and was inert. It was
   NOT the cheapest item: NVDA ships built, so it needed a zip reader.
2. **One experiment on the live-region intermittency**, varying speech rate, using `training:repeat` so
   the answer is a rate and not one capture. §18 is emphatic that *"every wrong turn today came from
   concluding off ONE capture."*
3. **Leave `punctuationLevel` alone** until 1 and 2 are done.

## What this audit deliberately does not do

- **Enumerate NVDA's settings.** That is a vendor list, and the corpus cannot exercise most of it.
- **Assert a mechanism for the live-region intermittency.** Three have been asserted and two refuted.
- **Treat "a command exists" as "a gap is closable".** `speakTypedCharacters` exists and the blocker is a
  corpus with no `oninput` on any of 3,948 pages.
