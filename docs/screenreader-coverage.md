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
| Read a table cell by cell | `T`, then `Ctrl+Alt+Arrow` | `structure.tableCells` | 1.3.1 |
| Tab through the page | `Tab` + report focus (**opt-in**) | `interaction.focusOrder` | 2.1.2, 2.4.3 |

Everything except the last is on by default; the default set costs ~15–17 s per capture.
`focusOrder` adds ~8 s, so it is requested per case with `"probeFocus": true`.

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
3. Default it **off** if it costs real time. `captureOptions` in `server.mjs` is where that
   contract lives.
4. Compare against a previous capture's **evidence**, not its counts. A readiness gate once
   deleted every `"heading, level N"` announcement in the corpus while every count-based check
   stayed green.
5. It only runs against NVDA on the Windows worker. Deploy, restart `a11ysrv`, capture a real
   page, and read the diagnostics — there is no local test.
