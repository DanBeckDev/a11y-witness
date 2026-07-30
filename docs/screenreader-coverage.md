# What the screen reader actually does — coverage and gaps

The point of this project is the *lived* assistive-technology experience, so the honest question
is not "does the capture work" but **"which of the things a screen-reader user does have we
actually driven?"** Anything we have not driven is not evidence we are missing — it is a claim
we cannot make.

This file is the map. Keep it current when you add a probe; it is how the next agent knows what
is real.

## Driven today

| What a user does | How we drive it | Field | WCAG |
|---|---|---|---|
| Read the page start to finish | line-by-line stepping | `transcript` | — |
| Jump heading to heading | `H` / `Shift+H` | `structure.headings` | 1.3.1, 2.4.6 |
| Jump between regions | `D` / `Shift+D` | `structure.landmarks` | 1.3.1, 2.4.1 |
| Tab-target hunt for controls | `F` / `Shift+F` | `structure.formFields` | 1.3.1, 4.1.2 |
| Operate a control, hear the result | activate in place, diff the speech log | `interaction.stateChanges` | 4.1.2 |
| Submit a form, hear the errors | submit, then re-scan fields | `interaction.formChanges`, `postSubmitFields` | 3.3.1, 3.3.3 |
| Find the images | `G` / `Shift+G` | `structure.graphics` | 1.1.1 |
| Hear link text out of context | `K` / `Shift+K` | `structure.links` | 2.4.4, 2.4.9 |
| Meet a list | `L` / `Shift+L` | `structure.lists` | 1.3.1 |
| Read a table cell by cell | `T`, then `Ctrl+Alt+Arrow` (**opt-in, see caveat**) | `structure.tableCells` | 1.3.1 |
| Tab through the page | `Tab` + report focus (**opt-in**) | `interaction.focusOrder` | 2.1.2, 2.4.3 |

The first nine are on by default and cost ~15–17 s per capture. The last two are opt-in per
capture — `"probeFocus": true` (adds ~8 s) and `"probeTables": true` (see the caveat below).

### Caveat: table cells are not dataset-grade yet

`tableCells` works and it discriminates — a table with `<th>` announces `"Departs, column 2,
09:15"` where one without says `"column 2, 09:15"`, which is the 1.3.1 evidence nothing else
gives us. But it is **not yet deterministic**, so it is off by default and **must not be used as
dataset evidence**.

Measured over 18 captures of one unchanged page across three workers: 4, 2, 4, 4, 1, 4, 4 cells,
and worse before the settle was added. In the same captures the quick-nav sweeps were rock steady
— `graphics`, `links`, `lists`, `landmarks` and `formFields` identical every time — so this is
specific to `Ctrl+Alt+Arrow` grid navigation and how fast NVDA updates its speech log, not to the
capture as a whole.

Three fixes each helped and none cured it: priming the caret into the grid (`T` lands on the
caption, so the first cell move answers `"Not in a table cell"`), treating a silent step as
retryable rather than final, and a 500 ms settle between keystroke and read. A field that varies
with timing is indistinguishable from a page that genuinely differs, which is exactly the
contamination this project exists to avoid.

**Update: `tableCells` is deterministic.** Across two separate sessions on one worker, every capture
that produced a working read gave **4 cells, identical** — 5/5 in the first session and 7/7 in an
eight-run session. Before the fixes the same test gave tableCells 0/4/4/4/0.

The residual variation is not the probe. Roughly 1 capture in 8 fails outright on a quiet host, and
when it does, `transcript`, `headings` and `tableCells` all collapse together — one fault presenting as
three. Those captures are refused by the dataset (see below), so they cost a retry, never evidence.

That met the criterion set here, so the probe is no longer suspected of being timing-dependent. It
stays **opt-in** anyway, because five runs on ONE page with ONE worker is not the corpus: promoting it
to dataset evidence wants the same test across several table shapes and more than one guest. That is
the remaining step, not a fresh doubt.

Two fixes were needed, not one, and the second mattered more than the delta:

**The delta read.** `walkTable` reads a `spokenPhraseLog`
delta rather than `lastSpokenPhrase`. That was the wrong read all along: a single sample of a moving
target returns the *previous* phrase when the announcement has not landed (indistinguishable from
"did not move") or nothing (which the walk took for the end of the table). Priming, silence
tolerance and the settle were each compensating for that, which is why all three helped and none
cured it.

**And the degenerate capture.** The apparent instability was mostly not the table probe at all: two of
five captures had a transcript of exactly `["<document title>"]` with no headings and no cells, so
every field "varied" because the whole capture had failed. The caret was never in the document.
`readWithRetry` re-anchors and reads again when that happens. It is worth knowing what that did and did
not achieve, because the diagnostics were unambiguous: the retry fires (proven — it had silently never
fired when its condition tested for the bare title, and the real shape was the h1 announcement), but it
does **not** recover the common case. `afterStart.lastSpoken: ""` with every sweep reporting `found: 0`
after three round trips means NVDA answered every keystroke and never spoke — a mute screen reader,
which reading harder cannot fix. That is now detected and failed immediately, so the worker cold-starts
a fresh NVDA for the next capture instead of sweeping a silent one for ~45 s.

Two guards refuse what gets through, and they catch different shapes: `captureHasSubstance` for a
transcript that is only the title, and `captureIsSelfConsistent` for the nastier one — a transcript
announcing `heading, level 1` while the heading sweep found none. The second shape passes both the
title and substance checks, so without it a capture that never traversed the page would have been
written as evidence. Once those landed, the table probe was identical on every
run — the delta read had already fixed it, and the noise was coming from somewhere else.

The lesson is the familiar one: three fields varying together was one fault, not three. Reproduce with:

```bash
npm run training:repeat -- --url=http://<host>:5050/<table-case>/good --times=5 --probe-tables
```

It exits non-zero if any field varies. Until that passes, `tableCells` stays opt-in and out of the
dataset.

## Not driven yet

Ordered by how much of a real user's experience is invisible without it. Every one names the
guidepup command that would do it, because that is the part that takes the digging.

| Gap | Why it matters | Route in |
|---|---|---|
| **Status messages / live regions** | 4.1.3 is *only* about announcements with no focus change. We catch these solely as a side effect of form submit, so a filter result or "3 items added to basket" is untested. | trigger a control, diff `spokenPhraseLog` — the machinery exists in `activateAndCaptureDelta`, it needs non-form triggers |
| **Dialogs and modals** | Focus on open, focus *return* on close, whether Escape works, whether the background is still reachable. A focus trap here is the classic blocker. | activate a trigger, then `reportCurrentFocus`, `Escape`, `reportCurrentFocus` |
| **Arrow-key widgets** | Tabs, menus, radio groups, comboboxes, sliders. Their whole interaction model is arrow keys plus `aria-activedescendant`; we currently only ever *land* on them. | `moveToNextRadioButton` / `moveToNextComboBox` to land, then raw arrows |
| **Heading hierarchy** | A skipped level (h2 → h4) is a 1.3.1 failure that a flat heading list cannot show. | `moveToNextHeadingLevel` |
| **iframes** | Embedded content with no accessible name is a dead end a user cannot label. | `moveToNextFrame` |
| **Language changes** | 3.1.2. NVDA switches synthesiser voice on `lang`; without it, foreign text is read as gibberish in the wrong voice. | needs synth-level observation, not a keystroke — hardest of these |
| **Typing feedback** | Live validation that fires while typing, and character echo. | `press` into a focused edit, diff the log |
| **SPA route changes** | 4.1.3 again: a client-side navigation that announces nothing leaves the user on a page they cannot tell changed. | activate a link, wait, diff the log |
| **Reading order vs visual order** | 1.3.2. Needs the DOM/visual comparison that axe-core and the visual layer own — probably **not** ours. | out of scope, deliberately |
| **Focus visible** | 2.4.7 is visual. Belongs to the axe/visual layer, not the screen reader. | out of scope, deliberately |

## Two facts worth not rediscovering

**Jumping to a table lands on its caption, not in the grid.** `T` moves to the table element;
the caption is inside it but outside the cells, and NVDA answers every `Ctrl+Alt+Arrow` from
there with `"Not in a table cell"`. The first version of the table probe therefore collected
only the table's summary line — and read *identically* on a table with `<th>` and one without.
A probe that cannot discriminate is worse than no probe, because it looks like evidence.
`enterFirstCell` steps the caret down until a cell move lands.

**`nvda.perform(command)` and `nvda.press("Control+Alt+ArrowDown")` behave the same.** Worth
knowing because every quick-nav command that works here is a bare letter, so a modifier combo
is the natural suspect when a probe goes quiet. It was checked directly and it is not the
problem — both returned NVDA's identical "Not in a table cell". Do not spend the hour again.

## Adding a probe

1. New **fields only**. A probe and its dataset signal are coupled; changing an existing field
   silently blinds signals that read it (this has happened, to 8 cases at once).
2. Prove it **discriminates** — run it on a good page and a bad page and check the two differ.
   Identical output on both means you have built instrumentation that measures nothing.
3. Default it **off** if it costs real time **or if it is not yet deterministic**. Run it 5+
   times on ONE unchanged page and require identical output; `tableCells` failed that and is
   therefore opt-in. `captureOptions` in `server.mjs` is where that contract lives.
4. Compare against a previous capture's **evidence**, not its counts. A readiness gate once
   deleted every `"heading, level N"` announcement in the corpus while every count-based check
   stayed green.
5. It only runs against NVDA on the Windows worker, and there is no local test. Deploy, **reboot
   the guest** (a `utmctl exec` restart silently does nothing when the guest agent is not ready),
   confirm with `npm run worker:code`, then capture a real page and read the diagnostics.
