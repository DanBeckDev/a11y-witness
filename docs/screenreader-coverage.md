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
| Jump between regions | `D` / `Shift+D` | `structure.landmarks` (**incomplete, see caveat**) | 1.3.1, 2.4.1 |
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

### Caveat: `landmarks` cannot see a landmark that spans the whole document

`structure.landmarks` is swept with `D`/`Shift+D`, and quick navigation **cannot reach a landmark that
contains the caret**. NVDA's `browseMode.py` searches by START position — `_iterNodesByType(type,
"next"|"previous", info)` — and an enclosing item requires a third direction, `"up"`, which no quick-nav
key uses. Its own docs say a landmark's name is spoken "when jumping inside from **outside**" it.

So a landmark wrapping the entire page with nothing outside it is invisible to the sweep, because every
position the caret can occupy is inside it. Anchoring does not help and makes it worse — `Ctrl+Home` is
still inside a `<main>` that starts at document position 0, and adding an anchor before this sweep turned
`["form, Hire duration"]` into `[]`.

**How often it actually bites is now measured per capture, and it is NOT most pages.** When a page has a
`<nav>` or header OUTSIDE `main`, the caret can sit outside it and quick navigation enters it normally —
and on entry NVDA announces the landmark's first content (`"Account help, heading, level 1"`), not the
word "main". Counting captures whose landmark list lacks the literal string "main" therefore reports
2,063 of 2,064, which is an over-count and was briefly recorded here as fact. Only pages where a landmark
encloses everything truncate; `structureCrossCheck` names those individually.

**What this does and does not affect, measured rather than assumed:**

- **Dataset signals: unaffected.** All 58 landmark cases use `{type: "structure-empty", field:
  "landmarks"}`, and their *bad* variants contain no landmark elements at all — so `[]` is the correct
  answer, and `check-signals` scores them 58/58 discriminating.
- **The local model: unaffected.** The exporter excludes `1.3.1:missing-landmark` outright.
- **The judge: affected.** It sees `landmarks: []` on a page that does have a `main`, and inferring
  "regions are unmarked" from that is wrong. This is why the judge prompt now says
  "'Landmarks/regions: NONE found' alone is not a WCAG failure without direct evidence".

**Read an empty `landmarks` as "no landmark was reachable by quick navigation", never as "the page
exposes none."** They are different claims, and only the first one is evidence.

### The completeness oracle: ask Chromium, not the screen reader

Every capture now records `structureCensus` — how many headings, landmarks, links and graphics the PAGE
exposes, from `Accessibility.getFullAXTree` over the DevTools socket the capture already holds open — and
`structureCrossCheck`, which names any disagreement `phantom` (sweep found more) or `truncated` (fewer).

**It costs nothing.** Measured 22.0 s and 19.7 s against a 19–20 s baseline: one CDP call is
milliseconds. Asking NVDA's own Elements List (`NVDA+F7`) for the same answer is authoritative and
agrees exactly — both report 2 landmarks where the sweep reports 1 — but costs **~11 s** per capture for
landmarks alone, and **~39 s** for all five types it supports (20 s → 59 s measured), because every
keystroke waits on guidepup's 1 s speech-quiet debounce. That is the difference between a check that runs
on every capture and one nobody can afford. `"probeElementsList": true` remains available as a
second opinion on the oracle itself.

**The census is an ORACLE, never evidence.** What the screen reader announced stays the evidence;
`docs/local-model.md` bars the accessibility tree from being a model feature. Its only job is to make an
under-reporting sweep distinguishable from a page that genuinely has nothing — which is the one thing no
amount of screen-reader output can tell you on its own.

It earned this immediately: it found a phantom heading (sweep 3, page 2) caused by `CONTAINER_PREFIX`
matching only `"<name> region,"` and not `"<name>, region,"`. 58 captures carried a duplicate; all 58 are
recaptured and every cross-checked capture now agrees.

### Caveat: table cells remain opt-in

`tableCells` works and it discriminates — a table with `<th>` announces `"Departs, column 2,
09:15"` where one without says `"column 2, 09:15"`, which is the 1.3.1 evidence nothing else
gives us. It is **not yet deterministic**, so it remains off for ordinary captures. Table cases
explicitly request the probe and use only the announced cell wording, never the number of cells, as
dataset evidence; a pair without an observable bad cell is skipped rather than treated as a match.

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

**Update: much improved, but NOT deterministic — and I overclaimed this once.** Two eight-run sessions
gave 4 cells identically (7/7 and 5/5), which I recorded as "deterministic". A third session then gave
**3, 4, 4, 4** among captures that all read the page correctly, so that claim was wrong.

The cause is visible in the transcripts: NVDA sometimes announces the table's `caption` and sometimes
does not, and the cell walk inherits that. Two distinct 9-phrase transcripts appear for the same page.
So the variation is in **NVDA's announcement**, not in the probe or its timing — a different and much
smaller problem than the 4/2/4/4/1/4/4 spread it started with, but not zero.

That is why it stays opt-in. A signal keyed on cell COUNT would be unreliable; one keyed on whether a
header word precedes the coordinates would not be, since that difference held in every capture.

Separately, roughly 1 capture in 8 (up to 3 in 8 in one session) fails outright even on a quiet host.
When it does, `transcript`, `headings` and `tableCells` collapse together — one fault presenting as
three, which is what made the probe look flaky in the first place. Those are refused by the dataset, so
they cost a retry and never become evidence.

That met the criterion set for the signal, so the probe is no longer suspected of measuring the wrong
thing. It stays **opt-in** for ordinary captures because five runs on ONE page with ONE worker is not
the corpus: promoting it to a default probe wants the same test across several table shapes and more
than one guest. The current table cases are the deliberate, bounded use of the signal.

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

It exits non-zero if any field varies. `tableCells` stays opt-in outside the table cases, and the
table signal remains presence-based so output-count variation cannot create a label.

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
