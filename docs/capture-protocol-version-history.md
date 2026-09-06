# Why each `CAPTURE_PROTOCOL_VERSION` bump happened

`CAPTURE_PROTOCOL_VERSION` (`packages/nvda-worker/src/capture-core.mjs`) is what the capture cache keys
on for evidence *meaning*, as distinct from the worker's code hash: the hash changes on every edit
including a reworded comment, which would invalidate the whole corpus for nothing, so the cache keys on
this instead. It moves only when the same page would now produce **different** evidence than it did
before — never for a refactor, and never for compatibility alone (an additive field an older consumer
ignores does not need a bump on its own).

This is the record of why each bump happened: what was measured, what broke without it, and what a
recapture bought. It exists so the reasoning behind a specific version number survives, without every
future reader of `capture-core.mjs` having to scroll past it to get to the constant.

## 2 → 3: browse mode is restored after every activation

Before this, `operateControl` activating a control left NVDA in focus mode, so the quick-navigation sweeps
that followed **typed their own letters into the page**. Measured on the corpus this bump invalidates:
`links`/`graphics`/`lists` came back empty on 353 captures, and 125 pairs carried the typed-letter artefact
on exactly ONE variant — always the conformant one, since only an accessible form focuses the field it
rejected. That is a pair differing by the measuring tool, and a shortcut feature sitting in the trained
scorer's input.

The recapture is therefore not a cost of this change, it is the point of it: those 125 pairs are the ones
whose evidence was wrong. `formChanges` entries also gain `kind`, and a submit now records
`postSubmitNames`, both of which criteria read.

## 3 → 4

Speech is settled before an activation's baseline is read, and after the browse-mode Escape.

## 4 → 5: the `list` sweep anchors to the top first

It reported `lists: 0` on every page whose links sit in a `<ul>` — both directions `exhausted` with empty
phrases, indistinguishable from no list at all. A field that was systematically empty now populates, so
cached captures must not be mixed with new ones: the worker's code hash is deliberately not in the cache
key, so without this bump a revert of the page sizes would silently reuse `lists: 0` evidence alongside
fresh `lists: 1` evidence.

Protocol 3's corpus carried ONE contaminated record out of ~125 activation captures —
`filter-status-silent/bad` recorded `after: "Energy results, document"` instead of the empty delta that is
the finding — and that single record was the false negative that made the retrained scorer fail its
release gate. A 1-in-125 race cannot be recaptured away, so the fix is the race and the bump is what makes
the corpus uniform afterwards.

Protocol 5 bumped for that race and did NOT fix it. Measured again on 2026-08-17, on a bare-metal fleet:
one capture in five of `filter-status-silent-solar/bad` recorded the same
`after: "Energy results, document"`, and the diagnostics say why. The contaminated capture is the one
carrying `browserRecycle` — a cold Edge start at the 25-capture boundary — while the four clean ones carry
`browserReused`. So it was never a 1-in-125 chance; it is ~1-in-25 and tied to a cadence.

Protocol 5's remedy — `waitForSpeechQuiet` before the baseline — was reachable and ran. It just gave up: a
5 s budget against a cold browser's document announcement, returning `quiet: false` to a caller that
discarded it, at all ten call sites. The guard could only fail one way and that way was unobservable, so
on the slow path it degraded into the fixed sleep it had replaced.

## 5 → 6: raises the baseline ceiling to 20 s and CONSUMES the result

The bump is not for the new `baselineQuiet` field, which no signal reads yet — it is because the same page
can now produce different evidence than it did under 5, which is the definition this file gives for a
bump.

## 6 → 7: capture-integrity-plan C1–C6

See [`capture-integrity-plan.md`](./capture-integrity-plan.md) for the plan itself; the SECOND reason
below is why it is a bump rather than an additive change.

What is new: `census.distinct` (distinct NAMES per type, because the sweep dedupes announcements while the
census counted elements — measured across 106 real pages, 75% of named elements share a name with another,
so the two were never comparable); `formControl` in that census, counting the roles NVDA's `f` quick-nav
actually visits; and `truncatedAnnouncements` marked UNCONDITIONALLY.

FIRST, it meets this file's own criterion — "a new field a signal reads". `completeness` and
`assertableSweep` read all three, and 2.1.1 and 4.1.2 now decline to assert on a sweep the census
contradicts.

SECOND, and this is the decisive half: WITHOUT the bump the recapture is a no-op. `workerCode` is
deliberately not in `environmentKey` — "it changes when a comment changes, and invalidating 1,061 pairs
over a reworded comment is how a cache gets switched off" — so nothing in C1–C6 moves a cache key.
`training:capture` would serve every cached capture unchanged, the new fields would never appear,
`completeness` would read `unknown` for ever, C2's guard would abstain on every page, and every gate would
stay green. A cache correctly serving stale-shaped evidence raises no error at all. That is the memoised
`browserVersion` again, which stamped five days of captures with a build they were not taken under and
defeated the fleet-consistency check written for exactly that.

And it meets the strict definition too: the same page now produces different evidence. A capture that
previously carried no truncation mark now carries one reading `{ truncated: [], checked: true }`, so
"nothing was truncated" and "nothing checked" stop being the same silence.

## 7 → 8: two evidence changes, bundled deliberately

[known-gaps §18 and §19](./known-gaps.md). Each needs a full recapture on its own and neither is urgent, so
paying once is the whole point; CLAUDE.md's rule is that the cheap moment for a key change is bundled with
another that was happening anyway.

- **§18** `dedupeKey` strips EVERY container prefix, not just the first. NVDA announces every container it
  entered, so a nested one survived and the same element keyed two ways — "main landmark, Home energy,
  region, Home energy" and "Home energy, region, Home energy" — and `structure.landmarks` reported 3
  landmarks on a page with 2. Measured: 146 of 24,774 sweep announcements, in 34 captures, every one a
  `landmark-*` case; the transcript channel was clean at 0 of 35,647 because `dedupeKey` is never applied to
  it. Verified over all 24,774: 146 keys change and NONE is reduced to empty, which is the over-strip
  signature this would otherwise risk.
- **§19** an accompanying defect declares the probes its evidence needs, and `withAccompanyingDefects`
  unions them over the host's. 69 cases carried the label `1.3.1:unassociated-table` with
  `probeTables: false` inherited from their host, so `structure.tableCells` was empty on every one.
  `grants-audit` passed correctly — the feature it checks reads the TRANSCRIPT — and only a rule would have
  noticed, by finding nothing.

Both are strictly evidence changes: the same page now produces different `structure` content. Neither is a
fix to what a capture MEANS, which is why they waited for a bump rather than causing one.

## 8 → 9 (2026-08-31): `observed` — WHAT THE CAPTURE ASKED, beside what it heard

A channel is a bare array and a bare array cannot say why it is empty. `media` has been alone in getting
this right for the whole project, with a comment saying so. Measured over 6,467 corpus captures:
`formChanges` empty on 4,830 with 3,006 NEVER ASKED, `postSubmitFields` 55%, and `tableCells` empty on 6,095
with not one where the tool could say the page has no table. Ten of the 28 model features read only such
channels, so a `0` they treat as a page fact is usually a fact about the request.

The same page can now produce different evidence than it did under 8 — a new field consumers read — which
is the definition this file gives for a bump. It is additive, so every existing channel keeps its type and
an older consumer ignores it; the bump is for the MEANING, not for compatibility.

## 9 → 10 (2026-08-31): costs NOTHING because no corpus exists under 9

`observed` shipped with eight of its eleven channels: `sweepExtraTypes` was called without the accumulator,
so `links`, `lists` and `graphics` could never say whether anyone asked. Threading it in is not a meaning
change and correctly did not move the key — which is exactly why the 46 captures already taken under 9
were served from CACHE, still carrying eight channels.

That is the split-corpus failure the key exists to prevent, arriving through the fix rather than through
the defect: a consumer reading `observed.links?.asked` gets a fact on some records and `undefined` on
others, and `undefined` is the ambiguity this whole field removes. Bumping makes the corpus provably
homogeneous for the price of 46 captures nobody has used.

## 10 → 11 (2026-09-01): three additions, bundled

Bundling is the whole point of this bump rather than an economy on it. Each of the three is individually
too small to justify ~4.5 h of fleet time, and the register says so about the first one outright; three
together are not, and taking them separately would have cost that time three times over.

- `structure.frames` — a frame sweep. An iframe with no accessible name is a real failure NVDA announces
  ("Radios example, frame") and this tool had no channel for it — CLAUDE.md lists it under what the corpus
  structurally cannot express.
- `interaction.dialogEscape` — focus, Escape, the delta, focus again. 2.1.2 asks whether a modal can be
  left, and nothing here could ask. Observational only: whether focus came back is a judgement about
  announcements and belongs to a rule.
- `formChanges[].baselineWaitedMs` — the settle MARGIN. `baselineQuiet` reads `true` on 1,117 of 1,117, so
  the verdict is a constant carrying no information while the margin still separates a robust wait from one
  record from the cliff.

All three are additive and an older consumer ignores each. The bump is for the MEANING, as with 9: the same
page now produces evidence it could not produce before, and two captures of one page must never differ by
which build took them.

## 11 → 12 (2026-09-01): the capture OPERATES MORE CONTROLS

`probeKindFor` now returns "toggle" for a check box or radio button under `probeForms`. A live region
updated by a checkbox was structurally unreachable before — real filters and consent toggles are checkboxes
far more often than buttons — and 4.1.3 is the criterion that could not see them. The safety decision, and
the line that draws it (can activating this NAVIGATE?), is in `SECURITY.md`.

BUMPED BEFORE THE CHANGE SHIPS, not after, and that ordering is the whole point. Deploying it at 11 would
put pre-toggle and post-toggle captures under one cache key — the split-corpus failure protocol 10 was
spent on, arriving through a probe instead of through a memo. The constant moving here is what makes that
impossible rather than merely unlikely.

The protocol-11 corpus being captured at the time was unaffected: it ran from an earlier commit and was
internally homogeneous. It was superseded by the next capture run rather than invalidated as evidence — the
gates it fed still ran against real captures.

## 12 → 13 (2026-09-01): `interaction.arrowNavigation`

The observation 2.1.1 abstains without. `SHARES_ONE_TAB_STOP` refuses to decide on a radio group, tab list
or menu, because a native one and a broken one both present ONE tab stop and the tab ring cannot separate
them. That refusal is correct and it leaves a criterion partly unanswered. Pressing the arrow is the only
thing that can answer it.

Bundled with 12 rather than deployed separately: neither had shipped, the fleet was mid-recapture, and two
bumps against one recapture is the waste this file's own rule about bundling exists to prevent.

## 13 → 14 (2026-09-02): the last two screen-reader-reachable criteria, bundled

- `interaction.focusContext` — the page title either side of FOCUSING the first control. 3.2.1 On Focus
  asks whether a control changes the user's context merely by receiving focus, and nothing here could ask
  it.
- `typedFeedback.title*` — the same pair either side of TYPING. 3.2.2 is 3.2.1 on change rather than focus,
  which is how `criterion-coverage.ts` has described it since long before either was built.

Taken together because 11's note is explicit that a bump should carry more than one addition: each is
individually too small to justify ~4.5 h of fleet time and taking them separately pays it twice. These two
were the whole of what `known-gaps.md` §23 listed as remaining, so the bundle was also the end of it.

The MEANING changes, which is what makes this a bump rather than an additive field: a page that renames
itself on focus now produces evidence it could not produce before, and two captures of one page must never
disagree about whether that question was asked. `observed.focusContext` appears on every capture taken from
here, and `undefined` on every one before — the split the key exists to prevent.

## 14 → 15 (2026-09-05): three evidence channels shipped and the cache could not see them

**Written retrospectively on 2026-09-06, because 15 shipped with no entry here at all** — the constant
moved and this file stopped at 14. Recovered from `5aecbec` rather than from memory. A changelog with a
hole in it is worse than a short one: a reader checking whether a shape changed under 15 would have found
nothing and concluded nothing changed.

`focusEvents`, `focusReveal` and the census/focus `candidates` field were all new fields a RULE reads —
this constant's own stated trigger — and none of them bumped it. `workerCode` is deliberately outside the
cache key, correctly, so every case whose PAGE had not changed was served its pre-probe capture.

**It presented as partly working, which is the worst way.** A case with no cache entry captures fresh, so
1.4.13's cases — added the same day — got the new probe and its rule fired 15 times, while the older 2.4.7
F55 cases came from cache and their rule reported `NEVER FIRED ANYWHERE`. A probe that reaches only the
cases nobody had captured before is indistinguishable from a probe that works.

## 15 → 16 (2026-09-06): four shape changes landed under 15, so 15 names more than one shape

The bump is a DISCRIMINATOR here rather than a lever. Everything below already forces a full recapture by
another route — `screenReaderSettings` joined the same bundle and is itself in `environmentKey` — so the
recapture is bought either way. What a bump buys that nothing else does is that a capture's own stamp says
which shape it is. Without it, `15` names captures from before tonight and after it, and `corpus:snapshot`
exists precisely so an old corpus can come back.

- **`navigatedOnSubmit` gained a `checked` discriminant.** It is `{checked, navigated, from, to}` now.
  Previously its ABSENCE conflated "the submit did not navigate", "`currentPageUrl()` could not be read"
  and "the probe never ran". Measured on `w3.org/WAI/demos/bad/after/survey.html`: the submit DID navigate
  and the field was null anyway. This is the one that most deserves the bump on the old rule too — a
  load-bearing field's PRESENCE stopped meaning what it meant.
- **The focus-event listener installs from document load** (`known-gaps.md` §42), so a log now witnesses
  what already held focus. `log[0]` was previously an unmatched `focusout` on most captures, and 2.4.7's
  F55 rule carried an `i === 0` exception for it, now deleted. Two captures of one page must never
  disagree about whether the first event was witnessed.
- **`focusReveal` carries `startedFrom` and `focusReset`** (§43). `probeFocusReveal` walked from wherever
  the previous probe left DOM focus, so `revealed: false` meant "nothing found FROM HERE"; it now blurs
  first and records where it started. The same page produced `revealed: true` on one path and `false` on
  the other before this.
- **The census carries `candidateUrls`** when the CDP target choice was ambiguous. `candidates: 2` was a
  count with no identity, and 30 real-page censuses were refused on it with no way to say which other
  document was on offer.

Deployed with `--allow-protocol-change` stated deliberately. The deploy refusal that guards this constant
is doing its job: it exists so a bump is never shipped as a side effect of an unrelated change.
