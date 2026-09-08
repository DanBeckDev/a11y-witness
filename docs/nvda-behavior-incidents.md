# NVDA Behavior Incidents

NVDA/browse-mode quirks and capture-timing behaviors this project learned the hard way, moved out of CLAUDE.md during the #458 split.

## Which browser a capture drives

See `docs/adr/0035-the-browser-preset-is-evidence-not-configuration.md` for the decision and what was
rejected (a tidier preset name, falling back to any installed browser). What follows here is the mechanism
and the incident that forced it.

`packages/nvda-worker/src/browsers.mjs` holds one plain-object preset per browser — exe search paths,
launch flags, profile directory, process image, window title. It exists because the browser was spread
across **eight** sites, which is this repo's most expensive recurring shape: a change applied at seven of
them and missed at the eighth is a capture that launches Chrome and kills Edge.

```bash
A11Y_BROWSER=chrome          # what this GUEST has (set once in run-server.cmd)
{"url": "...", "browser": "chrome"}          # per REQUEST, for a comparison run
npm run evidence:check -- <worker> --browser=chrome     # does Chrome announce the same as Edge?
npm run training:repeat -- --url=<page> --browser=chrome --times=5
```

**The browser is EVIDENCE, not configuration.** `environmentKey()` has always keyed the cache on
`browser`/`browserVersion` — for the same documented reason it keys on `os` and `architecture`, *"a fleet
can have more than one image"* — but that value was the literal string `"Microsoft Edge"`, a constant
standing in for a variable. It now comes from the preset, so the key does the job it was written for. Two
consequences follow and neither is optional:

- **Edge's preset must stay byte-identical.** Its `name` is `"Microsoft Edge"` and its flag list is the
  same flags in the same order, because that is what makes all 2,122 cached captures still valid. A tidier
  `"edge"` would invalidate the corpus for a rename. `browser-args.test.ts` asserts the whole command line
  against a literal — individual per-flag assertions cannot see a flag that was *added*.
- **Profiles are per browser, never shared.** Chromium refuses two builds on one `--user-data-dir`, and the
  quieter half is worse: a profile Edge warmed carries Edge's learned autofill into a Chrome capture.

**Nothing falls back.** A guest whose configured browser is missing reports `browserAvailable: false` and
says which browser and which paths — it does not quietly capture in whatever else is installed. A silent
fallback puts two browsers' evidence in one corpus, which is the failure the cache key exists to prevent
arriving by a different door. A tiny11 image ships without Edge; `A11Y_BROWSER=chrome` is how it says so.

**The Chrome preset has never taken a capture** — there is no Chrome guest yet. It is the Chromium
switches Edge shares plus `--disable-search-engine-choice-screen` (Chrome's `msEdgeWelcomePage`, and worse:
since Chrome 127 it is a MODAL, which is the fault class that blocks input while `/health` stays green).
Treat every Chrome line as a hypothesis until `evidence:check --browser=chrome` has compared them. That
comparison is the point: *does NVDA announce the same thing in the two Chromium browsers?* Nobody has
published it, and the Edge corpus on disk is the baseline that makes it a one-command question.

Two things deliberately need **no** preset. `window-focus.mjs` matches the window CLASS, and Chromium names
its top-level windows `Chrome_WidgetWin_1` whatever the branding — the code that focuses Edge focuses Chrome
unchanged. And `pointer.mjs`'s park is browser-agnostic, so Chrome inherits the real magnifier remedy even
though it has no such feature to disable.

**`A11Y_POINTER_AT="x,y"` deliberately mis-parks the pointer, to reproduce that Magnifier fault on
demand rather than waiting for it to recur on its own.** This project's own rule is that a guard never
shown to fail is not a verified guard — this is how the guard against the pointer sitting over content
gets exercised. An unparseable or malformed value falls back to the safe park point rather than failing
the capture, and the diagnostic mark records the coordinates actually used, so a typo in the value shows
up as `(0,0)` in the mark rather than as silence. Negative values are allowed, for a second display
sitting left of or above the primary. Dev/diagnostic only — no production capture needs this set.

**Firefox does not fit a preset.** No CDP, so the structural census, `bringPageToFront` and window reuse all
have no equivalent — it needs a separate capture backend, not another entry in this map. See ADR 0001.


### Quick navigation can never reach the element the CARET IS ON

Found 2026-08-28 by `gate:probe-order`, and it is more general than the one place this repo had written it
down. `sweepEveryStructuralType` records it for landmarks — *"Quick navigation cannot reach a landmark
containing the caret -- NVDA searches by start position"* — and treats it as a landmark quirk. It is not.
**Every caret position silently costs one element of whatever type sits under it, in BOTH directions**, so
`collectByType` sweeping backwards and forwards does not save you.

The consequence is the uncomfortable half: **the default probe order does not work by design, it works by
accident.** `readWithRetry` leaves the caret at the bottom, past the last heading, so the backward sweep
reaches the `h1` from below and nothing is lost. Nothing chose that; it falls out of the read-through
running first, and the sweep's own comment states the convention without noticing it is load-bearing.

Measured, on three corpus pages, permuting the probes:

| caret after the previous probe | result |
|---|---|
| bottom (what the read-through leaves) | every heading collected |
| on the `h1` — where `Control+Home` puts it, since document start IS the `h1` | **`h1` lost on all three pages**, including one that had been agreeing |
| inside a dialog — where `moveToContainingBrowseModeDocument` puts it | `h1` lost on both overlay pages |

So a "known-good starting point" here is a MODE and a POSITION, and the position must be **the one the
pipeline already establishes** rather than one that sounds principled. `Control+Home` was tried first and
made the gate worse — the anchor is `Control+End`.

**A sweep that structurally cannot see one element is the same shape as a truncated one**, and this project
already refuses to let truncation read as absence. That is unfinished: `collectByType` does not yet report
the element it could not reach.


### NVDA EATS THE FIRST ESCAPE, and `anchorToTop`'s Escape does not test what you think

Three facts about Escape, each found by capturing and each having produced a wrong answer first. They
matter to anything that asks whether a dialog can be left, which is WCAG 2.1.2's actual question.

- **After a focus probe, NVDA consumes Escape and the page never sees it.**
  `autoPassThroughOnFocusChange` switches focus mode on when focus lands on an editable, and Escape is
  flagged `ignoreTreeInterceptorPassThrough` *precisely so it stays reachable there* — so it leaves focus
  mode rather than reaching the application. `probeDialogEscape` presses **twice**: the first pays the
  toll, the second asks the question. Measured on one page whose only variable was the handler.
- **`anchorToTop`'s Escape is pressed in BROWSE MODE with focus on the body**, so a dialog that scopes its
  handler to itself — which is every real dialog — never sees it. `rules.ts` carried a paragraph claiming
  the opposite as a safety net (*"a ring that survives to be measured here has ALREADY outlived an
  Escape"*), and that claim was doing no work: it let the 2.1.2 rule accuse a conformant modal that closes
  on Escape and holds no operable control in its ring.
- **A sweep is browse mode and never moves DOM focus.** So a probe placed after the sweep observes Escape
  on the *document*, and a `focusin`-based focus guard never engages. The dialog probe rides with
  `probeFocusOrder` for this reason and is gated on it — the observation is not about a dialog otherwise.

**The general rule, and it is not about Escape.** A probe's precondition is established by *another probe*,
so where it sits in the sequence is part of its correctness. `probeOrder` exists to make that visible;
`observed.<channel>.why` now names *which* precondition was missing rather than reporting a bare `false`,
because "nobody asked" and "asked without the probe that makes it meaningful" need opposite fixes.


### `evidence:check` compared the interaction channels BY COUNT — fixed 2026-09-01

`normalise` is `String(entry)`, which is `"[object Object]"` for every object, so mapping it over a list of
objects made every entry identical. Exactly two compared fields hold objects — `interaction.formChanges`
and `interaction.stateChanges` — and they carry the evidence for 3.3.1, 4.1.2 and 4.1.3.

Measured on the real function: a `formChanges` entry whose `after` went from `"Error: name is required"` to
`""` reported **SAME**, from the one gate that decides whether 2,122 cached captures may be kept.

It is the same defect the object branch was written to fix, one shape along — that branch was added for
`routeChange`, a bare object, and objects *inside* an array kept reading as a count. `gate:stability` had
it too, on `stateChanges`, surviving the fix its own `formChanges` comment describes. **When you fix a
shape, grep for the shape, not for the field.**


### Focus mode makes quick-nav keys TYPE THEMSELVES INTO THE PAGE

The worst evidence defect this project has had, and it ran for 2,122 captures with every check green.

NVDA has two modes. In **browse mode** single letters are navigation commands (`h` heading, `k` link, `f`
form field, `g` graphic, `l` list). In **focus mode** they are passed to the application — so they are
typed into whatever has focus. From `browseMode.py`, not inference:

- `autoPassThroughOnFocusChange = boolean(default=true)` in `configSpec.py`, and `shouldPassThrough`
  returns True for `State.EDITABLE`. So a focus change into an editable control switches focus mode ON.
- `reason == OutputReason.QUICKNAV: return False` — quick-nav itself never switches it on. **Activating a
  control does**, because that is a real focus change: an accessible form moves focus to the field it
  rejected, a disclosure moves it into what it opened.
- It STICKS. `QuickNavItem.moveTo` returns early, still in focus mode, whenever the next target is
  focusable.

So every sweep after an activation typed its own commands into the page under test. Decoded from
apache.org's search box, which is how this was finally proved:

```
FFffGGggKKkkLLll  =  Shift+F,Shift+F,f,f   Shift+G,…,g,g   Shift+K,…,k,k   Shift+L,…,l,l
                     formField prev/next   graphic         link            list
```

apache.org search-as-you-typed it, rendered "1 result for FFffGGggKKkkLLll", and this tool read that as a
page behaviour and reported a WCAG 3.3.1 failure. The finding was our own keystrokes.

**Measured cost on the corpus this invalidated:** 353 captures activated a control and then found 0 links,
0 graphics and 0 lists. And 125 pairs carried the artefact on **exactly one variant, never both** — always
the conformant one, since only an accessible form focuses the field it rejected. That is a pair differing
by the measuring tool, the U+FFFC lesson again, and worse here because the artefact **correlates with the
property under test** and is therefore a shortcut feature available to the trained scorer. All 125 are
`form-error-*`; retrain after recapturing.

Rules that follow:

- **Restore browse mode after anything that activates a control**, and do not trust one remedy. Escape is
  NVDA's own route out (`script_disablePassThrough`, flagged `ignoreTreeInterceptorPassThrough` so it is
  reachable from focus mode), and it was **not enough on apache.org**, whose search panel behaves like an
  embedded document and needs `NVDA+Ctrl+Space`. The sweep detects the echo and escalates.
- **`nvda.press("Escape")`, never `nvda.perform(keyboardCommands.exitFocusMode)`.** Both are Escape on
  paper; only `press` worked, measured. `anchorToTop` has used `press` for this since long before anyone
  understood why.
- **A one- or two-character phrase is proof of this fault, not noise.** `MIN_CONTROL_NAME_LEN = 3` silently
  skipped it with a comment calling it a "stray key echo" — the symptom was named and never diagnosed. The
  sweep now reports `stopPhrase`, so `found=0 stop=repeat` (which says only "nothing") became
  `stopPhrase: "k"` (which says everything). An unrecoverable sweep stops as `focusModeStuck`, because
  "this page has no links" and "we could not ask" must never be the same evidence.
- **`anchorToTop`'s comment already documented all of this.** The remedy was applied only to the
  post-submit re-read, which is exactly why that was the one sweep that never broke. When a comment names
  a browser or screen-reader behaviour, check every path that behaviour can reach.


### Wait for the condition, never `sleep` a duration

The capture path had 18 bare `sleep()` calls against 3 polling loops, and one of them caused the worst
defect this project has had: a fixed wait expired early, the probe timed out, and the miss was recorded
as **"the page announced nothing"** — which is precisely the signature of a non-conformant disclosure. 1
in 20 captures of a CORRECTLY implemented page was indistinguishable from a broken one. That does not
add noise, it **inverts the finding**.

A fixed sleep is wrong in both directions: too long in the common case, and too short in the tail where
being wrong destroys evidence rather than merely costing time.

**guidepup does NOT wait for speech to settle, and this file said it did.** The claim used to be that
`enqueueAndTap` resolves only after a quiet period, so `nvda.perform()` returning meant speech had
settled and sleeping on top of it was waiting twice. That is true only for `{capture: true}`. This
project calls `nvda.start()` with no options, so it gets `DEFAULT_CAPTURE = "initial"`, and in that mode
`#processQueue` resolves on the FIRST spoken phrase:

```js
const speakHandler = (spokenPhrase) => {
  spokenPhrases.push(spokenPhrase);
  if ((options?.capture ?? this.#capture) === "initial") {
    clearTimeout(timeoutId); speakPromiseResolver();      // <- returns on the first phrase
  } else { timeoutId = setTimeout(timeoutHandler, SPEAK_DEBOUNCE_TIMEOUT); }
};
```

So later utterances of the SAME announcement can still be in flight when a keystroke returns, and the
settle sleeps were load-bearing rather than redundant — which is why deleting them broke things and why
the wrong claim survived so long. guidepup's own docs say it: "By default the `capture` option is set to
`"initial"` … for full capture set `{capture: true}`."

`{capture: true}` is not a free upgrade: it changes every log entry from the first phrase to all phrases
joined with ". ", which is an evidence change and a full recapture. So the fix is to wait for the real
condition instead — `waitForSpeechQuiet` polls `spokenPhraseLog` until it has been unchanged for
`SPEECH_QUIET_WINDOW_MS`, bounded by a budget, and reports `quiet: false` rather than pretending.

Converted so far, ~5.4 s per capture:

| site | was | now |
|---|---|---|
| cold-start readiness | 3000 ms | poll until NVDA's Remote port answers |
| `probeDisclosure` after `act()` | 1200 ms | `waitForAnnouncement` — wait for speech, then quiet |
| `reportFocusedControl` | 1200 ms | poll until a phrase exists |

**All of them are now conditions.** `ANCHOR_SETTLE_MS` (×4), `WINDOW_SETTLE_MS`, `TABLE_SETTLE_MS`,
`STATE_SETTLE_MS`, `SPEECH_RECONNECT_MS` and `NVDA_SETTLE_MS` are gone. Every remaining `sleep()` in
`capture-core.mjs` is a poll INTERVAL or a retry gap (`*_POLL_MS`, `NVDA_RETRY_DELAY_MS`), which is the
correct use — the gap between two checks of a condition, not a substitute for one.

Two of them were worse than wasteful, because a short guess did not merely cost time:

- `SPEECH_RECONNECT_MS` (750 ms) slept once then probed ONCE. A reconnect taking 751 ms was reported as
  a failed socket rebuild, and the remedy for that is restarting NVDA — the expensive action that
  produces the `injection_terminate` modal which wedges a guest. It now polls to a 6 s budget.
- `NVDA_SETTLE_MS` (3 s) slept then probed once, and the next line THROWS `SCREEN_READER_MUTE`. A screen
  reader needing 3.1 s became a false capture failure that the run paid for with a whole retry. Now
  polled to a 10 s budget; only then is silence a finding.

Verified `evidence:check` 48/48 SAME, so no recapture, and canaries stable 3/3 per page.

**Two traps when doing this.** A condition must be *sufficient*: `screenReaderResponds()` only proves
the Remote port accepts a TCP connection, not that NVDA's virtual buffer is navigable. And the deadline
must exceed the slowest honest answer, because silence is a legitimate finding — if a probe gives up
early, "nothing was said" and "we stopped listening" become the same observation.

**Verify by importing the module.** Removing a constant that three other call sites still used left
`capture-core.mjs` throwing `ReferenceError` at import, and **neither `npm run lint` nor `tsc --noEmit`
caught it**. For `.mjs`, `node -e "import('./path.mjs')"` is the only real check.

