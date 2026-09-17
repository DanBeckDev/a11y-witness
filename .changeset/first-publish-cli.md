---
"a11ign": minor
---

The first published version of `a11ign`. Everything below landed before it: the rename first, then oldest first.

- The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
  binary names and every cross-package import specifier change with it (issue #66). Nothing had been
  published under the old name, so this is a rename landing in the tree before the transfer to the
  `a11ign` GitHub organisation, not a migration for existing consumers.

- `packages/cli/README.md` gains a one-line pointer to the top-level README's routing decision ("which of
  the GitHub Action or the local path is yours"), replacing a paragraph that repeated the decision instead
  of deferring to it.

  ---

  **Why this is a `patch` and not `--empty`.** `npm pack --dry-run --json` puts `README.md` among the files
  `a11ign` ships, so it is consumer-facing prose, not an internal doc — the same category #229's
  changeset named: *"a packed file that IS the consumer-facing prose"* is a real changeset, unlike a
  packed-file change that is comments-only or a file npm never packs at all. The root `README.md` and
  `docs/getting-started.md` this same PR also touches are NOT packed by any published package (`npm pack
  --dry-run --json` from the repo root packs nothing outside `packages/*`), so only this one file's change
  needs an entry.

- The human-readable report now says `asserted` and `referred` where it previously said `FAILED` and
  `NEEDS REVIEW` for a per-criterion outcome — worded per ceo's ruling on #242. The ACT vocabulary term
  (`failed`/`cantTell`) is named exactly once, in the legend's own parenthetical, never repeated at each
  finding.

  `--json` and the `ActOutcome` values it carries (`"inapplicable" | "passed" | "failed" | "cantTell" |
  "untested"`) are unchanged: `printJson()` never imports from `report.ts` and passes `outcomes:
  CriterionOutcome[]` through to `JSON.stringify` untouched, so a script parsing `--json` output is
  unaffected — only the human-facing text report's wording moved.

- The first command on the README now works. It was `npx a11ign …`, which returns `E404` — nothing is
  published yet — so the first executable thing a reader met taught them only that the tool is broken. The
  page now leads with the two routes that work today: the GitHub Action, and a clone. The `npx` form is kept,
  below, labelled as what it will be rather than what it is.

  ---

  **Why this is a `patch` and not the `--empty` nearly every other changeset here is.** Of the 13 entries
  already in `.changeset/`, **12 are empty and the one that is not was written by a machine** —
  `promote-candidate-0d498ef6.md`, a `major` on `@a11ign/scorer` that `promote:model` wrote itself. So
  this is the first hand-written entry in the repo to declare a bump, which is worth stating rather than
  slipping in. The closest precedent — `capture-probes.mjs`, a packed source file — reasoned that a consumer
  received different bytes but not different behaviour, so `--empty` was honest. That entry's own table names
  three categories; this is a fourth:

  | | |
  |---|---|
  | a packed file whose behaviour changed | a real changeset |
  | a file npm never packs | the gate should not fire (#132) |
  | a packed file, comments only | `--empty` is honest |
  | **a packed file that IS the consumer-facing prose** | a real changeset — this one |

  `npm pack --dry-run --json` puts `README.md` among the 55 files in `a11ign`'s tarball, so it ships;
  and unlike a comment, a README is not inert to the reader — it *is* what the consumer reads first. A change
  that takes its opening command from broken to working is a change to what they receive, even though no code
  path moved.

  Recorded rather than left to silence, per `.changeset/README.md`: `changeset status` cannot tell "nobody
  wrote one" from "somebody decided", and only one of those is a decision.

- The GitHub PR comment (`packages/cli/src/action/summary.ts`) no longer prints the raw ACT vocabulary
  term `cantTell` at a reader who has no legend to explain it — worded `referred` instead, per ceo's
  ruling on #242 (PR #252). Unlike the CLI's own terminal report, there is no legend here to house even
  one parenthetical ACT mention, so the term does not appear at all in this renderer's output — a
  stricter bound than #242's "exactly one occurrence, in the legend."

  `--json` and `ActOutcome` are unchanged: `printJson()` (`cli.ts:719`) has zero references to
  `report.ts`, and `summary.ts` reaches the `outcomes` field independently through its own path — a
  script parsing `--json` output is unaffected.

- The hard capture timeout now carries a fault code (`hard-timeout`) instead of an untagged `Error`, so a
  CLI reader gets a plain-language explanation — "the capture ran too long and was abandoned" — instead of
  the generic no-remediation path. The message also names how far a partial capture got (the last recorded
  progress phase, and how many progress marks were recorded) when the worker reported one, so "we ran out
  of time partway through" and "we could not read your page at all" read as the different findings they
  are. Additive on the wire: an older CLI reading a fault code it does not recognise already falls back to
  "no remediation recorded" rather than failing, and an older worker's untagged timeout error is unaffected
  by either side of this change.

- The warning printed when a capture cannot be trusted to describe the requested page (a consent overlay
  the tool could not dismiss, or content that still doesn't match the page's title after retrying) now gets
  the same WHAT/TRY/WHERE remediation a worker fault does, instead of a bare sentence — issue #398. The
  underlying judgement is unchanged: this only makes the message actionable.

- #168: removed each package's own `"prepare": "tsc --build"`. Nothing a consumer installing the published
  package observes -- `prepare` never ran for a registry install in the first place (only `prepack`, which
  still runs `tsc --build` unchanged, ships the tarball). This only affects `npm ci` inside this monorepo:
  three packages' own `tsconfig.json` reference the same `evidence` project, so npm firing all five
  workspaces' `prepare` scripts concurrently could start several independent `tsc --build` processes writing
  to `packages/evidence/dist/*` at once -- a real file-write race, source of the intermittent `ci/ts`
  failures. The root's own `prepare` now runs `npm run build` once, coordinating the same dependency graph
  through a single `tsc --build` invocation instead.

- `npm run witness` now writes the capture it took to `runs/witness/<stamp>-<slug>.json` and prints the
  path as the last line of its report (or as an `artifactPath` field alongside `--json`), so a run that
  goes wrong — a consent overlay, a page that reads short, a timing that surprises you — leaves you a real
  file to send someone or open with `npm run capture:explain`, instead of only a printed report. This is
  ON by default; pass `--no-keep` to skip the write, which is confirmed explicitly rather than silently
  doing nothing.

- Fixed the copyable GitHub Actions workflow in this package's README: it was missing an `actions/checkout` step, so a reader copying it exactly got an empty workspace and the Action never reached the page.

- Fixed #493: when a run failed before producing any report at all, the Action's PR-comment step used to
  print "Could not post the PR comment. The job summary still has the report" — false, since nothing was
  ever produced. It now says so honestly, naming the real cause, and keeps the original message for the
  case it was actually written for (a report exists, but posting the comment itself failed).

- Fixed #567: the Action's own PR-comment step (`if: always()`, so it still reports when an earlier step
  failed) crashed with `Cannot find package '@a11ign/worker-fleet'` whenever that earlier failure happened
  before `npm ci` had run in the Action's own checkout — which defeated the honest "no report was produced"
  message #493 added, since the step that would print it died on import first. The Action no longer depends
  on a workspace package to report its own failure.

- `npm run witness` now prints an early, in-flight notice within roughly a minute of capture start when a
  page looks like it is heading toward a "contained" doubt (a consent overlay Escape could not dismiss) —
  previously this warning only appeared after the whole capture finished, which could be several minutes
  later with no intervening output.

  The early reading uses the SAME threshold `captureDoubt`'s finished-capture verdict already applies
  (`@a11ign/evidence/verify`'s new `earlyContainmentVerdict`), read off marks the worker's `/progress`
  endpoint already reports — nothing new is recorded by a capture, and no cached evidence is affected. The
  notice is purely informational: it never changes whether or how a capture proceeds, and prints at most
  once per capture. `earlyContainmentVerdict` and its `EarlyContainmentVerdict` type are additive exports.

- Fixes a real defect that produced a nonsensical, published "44 headings swept against a ground truth of 1"
  report — a capture of calendly.com whose form probe activated its own "Continue with Google" button,
  navigating to `accounts.google.com`'s sign-in screen before the browser's element census was taken. NVDA's
  sweep had genuinely read calendly's real 44 headings; the census, taken after the whole sweep at the time,
  described Google's page instead — and the report treated the census's tiny count as calendly's real total,
  printing "reached in full".

  Two changes:

  - `packages/nvda-worker/src/capture-probes.mjs`: the census is now taken before ANY probe capable of
    navigating the page (previously only before `probeRouteChange`, which missed the opportunistic form
    probe's own activation — the actual cause here). The census reads the accessibility tree over an
    already-open DevTools socket, never NVDA, so this changes WHEN a diagnostic snapshot is taken, not what
    a capture hears; `CAPTURE_PROTOCOL_VERSION` is untouched.
  - `@a11ign/evidence/conformance`: a census whose CDP target could not be confirmed (`targetMatch:
    "fallback"`) is now refused for any sweep-versus-census comparison, and the report states plainly that
    the census likely describes a different document rather than treating its count as ground truth. New
    export `censusTargetMismatchReason`; `censusFromDiagnostics` also refuses a fallback-target census.

- The early consent-overlay-style notice `npm run witness` prints during a capture (added in #676) now
  reads a different, earlier diagnostic mark and no longer names "consent" specifically.

  `earlyContainmentVerdict` previously waited for `structureCensus`, which #426's own fleet measurement
  found lands at the very END of a capture — its timestamp equalled the total capture duration in all nine
  real captures measured, so a verdict waiting on it is never early. It now reads `pageState`'s raw DOM
  element count (recorded immediately before the structural sweep, well before a capture's later probes
  run) against the same `structural` mark as before, discriminating the identical real cases 80-90 seconds
  sooner: verified against three real captures (theregister.com and hubspot.com as positives from two
  different mechanisms, en.wikipedia.org — the slowest of the three — as a control that must not fire).

  The notice's own wording no longer names a consent overlay as the cause: hubspot.com fired it from an
  unrelated mechanism, so a consent-specific sentence would have been wrong on a real page that triggered
  the same, honest "reached almost none of this page" finding.

- Every capture can now say WHICH document it was served, and two captures of one URL are no longer
  indistinguishable (#687).

  `environmentKey()` keys a capture on everything about the environment — browser, OS, architecture, NVDA,
  guidepup, screen-reader settings, the provisioning revision, the protocol version — and, for corpus
  pages, on the page directory. It recorded nothing about what the server actually sent. Measured on
  `https://calendly.com/`, two captures eight minutes apart on one worker: one was served Google's sign-in
  wall (the form probe activated "Continue with Google"), the other `calendly.com/scheduling`. Both records
  say `url: "https://calendly.com/"`.

  `documentIdentity()` derives that identity from marks the capture already carries — the served URL from
  the census marks, the title from `titleSource` — so **every capture already on disk has one**, including
  the two above. Nothing new is observed and no second copy is stored.

  - **`evidence:check` and `gate:stability` refuse rather than compare.** A pair served different documents
    is a distinct outcome (`DIFFERENT_DOCUMENT`), never a list of field differences: those differences are
    all true and all irrelevant, and they send a reader after the capture pipeline when the cause was the
    page. `summarise` excludes such a pair from the sample and reports the run inconclusive.
  - **The report says which render it describes.** WCAG Requirement 2's limitation has always read "one
    viewport, one state, one document" without ever saying which; it now names the served path, the title
    and the element counts.
  - **The document identity is NOT a cache key,** and two tests now say so with the reason. Adding it would
    invalidate 2,122+ captures to guard a population that is empty: real-page captures never cache, and the
    corpus's pages are generated into a directory the key already covers.

  The counts are reported and deliberately not compared: a real page recaptured an hour later has moved
  links and is the same document, so deciding identity on counts would refuse most of the population this
  runs against.

  The served path is origin + path, because a sign-in URL carries per-request nonces and two captures of one
  wall would otherwise differ every time. Each capture records HOW MANY query parameters were dropped —
  the count, never the values — so a "same document" verdict says where it rests on origin and path alone.
  `docs/known-gaps.md` §46 records what that costs: a site whose documents differ only by query string reads
  as one document here.

  One finding fell out of measuring the records rather than reasoning about them: the 10:42 capture carries
  eleven `titleSource` marks, ten saying "Sign in - Google Accounts" and the last saying "Privacy Notice
  Calendly". A capture whose own marks name two documents has no single identity, and the report now says
  so rather than silently taking the first.

- The per-field activation gets its own budget, and a control it never reached is no longer reported as a
  control that said nothing (#677 part 2).

  `formField` is the third of eight sweeps and the only one carrying an `onItem`, and that `onItem`
  activates a control and waits for speech. Measured over three real captures, taking 180 ms/trip — what
  every other sweep type costs — as the sweep's own price and attributing the excess:

  | capture | fields | sweep | attributable to the activation |
  |---|---|---|---|
  | calendly, `probeForms` on | 18 | 57.2 s | 49.0 s (86%) |
  | calendly, `probeForms` off | 46 | 138.7 s | 119.3 s (86%) |
  | ikea | 100 | 322.3 s | 283.0 s (88%) |

  On IKEA that consumed the whole capture: `formField` stopped on `deadline` and the five sweeps after it —
  `graphic`, `link`, `list`, `frame`, `postSubmit` — each returned `deadline` having examined nothing. **Two
  structural types out of eight**, and `postSubmit` is where 3.3.1 and 4.1.3 live.

  The activation now stops at **half of what remains when its sweep begins**, so the sweeps after it keep at
  least as much as it takes. One number, and it is the one that moves if the fleet measurement disagrees.
  **The unit is a five-second wait, not a millisecond**: the cost divides out at 4.5–8.8 s per activation
  against `STATE_WAIT_MS` of 5,000, so a budget buys a count of waits and covers fewer controls than a
  reader would expect.

  Controls the budget refused are **counted and reported**. A refused control produces no `formChanges` and
  no `stateChanges` — byte-for-byte what a control that announces nothing produces — so the report now says
  `40 of 100 form control(s) were NOT ACTIVATED`, and says every control was offered when none were refused.

  **Also corrected: the coverage sentence was comparing unlike with unlike, and said it was not.** It
  promised "distinct announcements against DISTINCT NAMES the browser reports — like compared with like",
  but `distinct` collapses by name and an element with **no** name counts as its own. Measured: calendly
  `graphic=63, graphicUnnamed=38, distinct=61` (two collapsed); ikea `graphic=205, graphicUnnamed=0,
  distinct=165` (forty collapsed, correctly). So the reach denominator invented a shortfall in our own
  report on any page with unnamed elements.

  The two sentences now use two denominators, because they ask different questions:

  - **`NOT EXAMINED (of N)`** counts every element on the page. An unnamed graphic that was never examined
    is unexamined.
  - **`reach R/N`** counts only what a sweep could ever have announced — `distinct` minus the unnamed.

  A nameless element is excluded from **reach** and never from **assessment**: 1.1.1 is one of the four
  subtypes this project may assert, and its evidence is the unnamed count itself. Captures predating the raw
  census fall back to exactly what they reported before.

- `npm run bench:capture -- --from-disk --sweeps` answers #659: **the sweep cost is what seeing the page
  costs.**

  `sweep` is the largest phase on every real page measured and the only one that scales — 78.5% of one run
  on its own. That is the case for looking, not evidence of waste: `collectByType` walks the page by
  quick-navigation and that is how this tool sees structure at all.

  A phase total could not answer it. One phase covers eight sweep types, and one of them (`formField`)
  carries a per-field activation the other seven do not — summed, that type's behaviour is everybody's.
  Split by type, across six pages replayed from captures already on disk:

  ```
  type        pages  thin  rates (median ms/trip)      spread  cause
  formField       4     2  222, 1261, 323, 463            5.7  per-step
  graphic         4     2  162, 146, 180, 174             1.2  per-element
  heading         3     3  173, 180, 165                  1.1  per-element
  landmark        3     3  165, 157, 171                  1.1  per-element
  link            3     3  178, 189, 184                  1.1  per-element
  list            2     4  200, 220                       1.1  per-element

  walk rate (every type with no onItem): 163 ms/trip
  ```

  **Every sweep that only walks runs at the same rate on every page**, across pages differing by an order of
  magnitude in element count. The total is trips times a constant, and trips is how many elements there are.
  `formField`'s excess over 163 ms/trip is its activation, not a slower walk — and on the two most recent
  captures it reads **190** and **202** ms/trip, which is the walk rate, because the probe cost nothing on
  those pages.

  Two things the replay found in its own first output, both now guarded:

  - **A sweep that never ran was contributing `0 ms/trip`** — a starved sweep records `found: 0`, `ms: 0`
    and two baseline round trips, so a naive divisor made it the fastest sweep in the set. Read from the
    stop reason now, never inferred from `ms === 0`.
  - **A page whose sweep barely moved was setting the verdict.** One page whose heading sweep found ONE
    heading reported 345 ms/trip against 180 on the page with eighty — the rate was highest where the sweep
    found the least. Pages under 20 round trips are excluded and **counted**, and the floor is measured
    rather than chosen. It changed `heading` from `per-step` to `per-element`.

  `--from-disk` also now reads both record shapes. A `runs/witness/` record wraps its capture, so pointing
  the tool at the directory #659's own Region names reported "No captures with diagnostics" over 24 of them.

- Fixed the GitHub Action's PR comment printing "**No blocking findings** Yes" directly above findings marked
  serious when using the default local judge. The headline now states the count instead (e.g. "none; 6
  finding(s) below that severity"), matching the CLI text report's own wording -- a bare yes/no is shown only
  for backends (anthropic/openai) that actually answer a question about the task.

- A 4.1.2 finding is no longer asserted from a before/after pair that names two different controls (#812).

  `probeDisclosure` activates a control and records `after` from `reportCurrentFocus` — **whatever holds
  focus afterwards**, not a re-read of the control it activated. Those coincide only when activation leaves
  focus put, which is why this held across 2,000+ corpus captures and broke on a nav menu that moves focus
  into what it reveals. The V1 rehearsal's only 4.1.2 finding was:

  ```
  control  "…, list, with 6 items, Platform, button, collapsed"
  after    "Outline, menu button, focused, collapsed, sub Menu"
  ```

  Both say `collapsed`, so the state comparison passed **across two different controls**. The literal
  `focused` token is `reportCurrentFocus`'s own output: the capture was saying which question it answered,
  and nothing read it.

  `addSilentStateChanges` now establishes **identity before state** — the announced names must match, and an
  empty name is not an identity. The guard reads the announcement strings, which every capture already
  carries, so it applies retroactively with no protocol bump and no recapture.

  The claim this makes is narrow: **the capture never made the observation such a finding rests on.**
  Whether that control exposes its state change is unknown, not disproved.

  The capture also records `afterSource: "focus"` so the record says which question it answered in a field
  rather than in a comment, and `probeDisclosure`'s comment no longer promises a re-read of the control or a
  read of the accessibility tree — it never did either. Making `after` a true re-read needs a CDP read of
  the activated element and is an evidence change: a separate row.

- Every sweep now fingerprints the document it is about to walk, and the report can say **which** sweep a
  mid-run navigation happened during (#758).

  `documentIdentity` (#687) gives a capture one identity; `targetMatch` (#699) says whether the census
  described the requested page. Neither localises a navigation that happens *during* the run — and two
  fingerprints per capture bracket **eight** sweeps, so a capture that moved could be seen to have moved and
  not to have moved anywhere in particular.

  `documentChangedDuring` reads the served URL from each `pageState` mark and names every boundary the
  document changed across. On the two calendly captures already on disk:

  ```
  probeForms ON    sweep -> focus   calendly.com/  ->  accounts.google.com/v3/signin/identifier
  probeForms OFF   sweep -> focus   calendly.com/  ->  calendly.com/scheduling
  ```

  **Both arms navigated** — the "probeForms off" arm reached another calendly page, so it did not hold
  still, and only the per-sweep `found` counts (link 82 against a census of 76, versus link 5) say the ON
  arm's sweeps were the ones walking the other document. That correction came from writing the reader: the
  first version compared element counts and reported a change in both arms, which is true and useless
  because a page that lazy-loads content changes its counts without changing document. **Identity is the
  served URL, not the shape** — the same distinction #687 had to draw, one level in.

  `collectByType` now calls the existing `markPageState` as `sweep:<type>`, at the **one** place every sweep
  reaches the page, so `sweepEveryStructuralType`, `sweepExtraTypes` and `rescanFormFieldsAfterSubmit` are
  all covered by a single line and `probeStates` groups them for free — no new mark, no new comparator, and
  `FINGERPRINT_KEYS` still spelled once.

  The granularity is reported rather than assumed: with per-probe marks the answer is "between sweep and
  focus", a window containing eight sweeps; with per-sweep marks it names the sweep. Reporting the first as
  though it were the second would be invented precision.

  `pageState` also records `tookMs`. Its own header calls the fingerprint cheap, and this adds one per
  sweep to what is already the largest phase of a real page — so the cost of the instrument is now a number
  in the next capture rather than a claim in a comment.

- #800 asked whether IKEA serves 265 form controls or the sweep walks more than is there. **Neither is
  established, and the reason is that the question cannot be asked of any capture on disk: the two numbers
  describe different moments and one of the instruments moves the page it measures.**

  `sweepAgainstCensus` compares each sweep's `found` against the census's **raw** element count — never
  `distinct`, which #737 established counts nameless elements as separate names. It issues **no verdict**
  from these captures, and the ratios are reported with the reason:

  ```
  type        ratios (complete sweeps only)   completeness   verdict
  formField   --   --   --   2.17 2.12        t t t c c      not-simultaneous
  graphic     --   --   1.41 1.41 --          n n c c t      not-simultaneous
  heading     0.96 0.96 1.16 1.16 1.16        c c c c c      not-simultaneous
  landmark    0.86 0.86 0.86 0.86 0.86        c c c c c      not-simultaneous
  link        --   --   --   --   --          n n t t n      not-simultaneous
  ```

  **This corrects what #836 merged.** That PR shipped "the honest answer is NEITHER — the question
  presupposes a shared denominator and the instruments do not have one", and the mechanism was wrong.
  **#699 merged at 12:40:39Z, into the middle of the five-capture set**, moving the census read from after
  the probes to before them: two captures measured what was present once the sweeps had walked the page,
  three measured it before anything touched it, and nothing in the record says which. The 0.45-to-2.12
  inversion is the instrument crossing a code change.

  **And the field used to date the instrument is the field the instrument misreports.**
  `structureCensus.atMs` is stamped at MARK time, so it puts the census last on all five captures — which is
  how the first answer came to say "#699 isn't in any of them" when it is in three. That is why this gates
  on simultaneity rather than on a corrected stamp.

  **Two distinctions had to be built before that was visible, and each changed the answer once.**

  **A ratio only means anything from a sweep that ENDED.** `sweepCompleteness` draws three states:
  `exhausted` and `silent` are a sweep running out of elements; `deadline`, `cap`, `error` and
  `focusModeStuck` are a sweep being cut off, and its `found` is a lower bound. Read without that,
  `formField` gives `0.45 0.45 2.27 2.17 2.12` and looks like a comparison changing sign; three of those
  five are truncations. These are `examinationState`'s three states (#677), one level down at the sweep.

  **A ratio only means anything if both sides describe the same moment.** The census is read at t≈0 and
  `formField` walks at t≈300-400 s, activating 64 controls while it walks — so on a lazy-loading page every
  ratio above 1 is the page growing between two reads, and nothing here can tell that from over-walking.

  **`heading` is the nearest thing to a control and shows why.** No `onItem`, walks at ~100 s, and it
  announces **80 on all five captures** while the census reports 83 then 69. A numerator holding still under
  a denominator that moves 17% is not that numerator's control.

  **The gate is not permanent and not a placeholder.** It opens on `readAt.startedAtMs` — the field #854
  adds, which no capture on disk carries,
  because `structureCensus.atMs` is stamped at MARK time and the census is read at the top of
  `navigateByStructure` and marked after it returns, so that field is off by the whole capture. A test pins
  the behaviour the fix unlocks so the gate cannot quietly become permanent.

  One thing ruled out cleanly: **the sweep is not double-counting.** All 265 announcements on the 14:31
  capture are distinct, and still 265 after normalising away every state word.

  `sweepNeverRan` and `sweepCompleteness` live in `sweep-costs.mjs` as the one place that decides how far a
  sweep got, because a second spelling is how two readers drift apart.

- **`structureCensus.atMs` said the census was read at the END of the capture. It was read at the start —
  and on 25 of 25 captures in one checkout's `runs/witness`, the field landed within 60 ms of the last mark
  in its file.** The error is the whole capture: 93 s to 469 s, median ~310 s.

  `createDiagnostics`' `mark` stamps `atMs` inside `entries.push`, so `atMs` is when the mark was PUSHED.
  That is right for a phase mark, whose push *is* the event, and wrong for the three census marks: they are
  read by `censusBeforeNavigating` at the top of `navigateByStructure` and pushed by
  `navigateByStructureThenAudit` after every sweep and probe has run.

  **Three marks, one read site, one defect.** `structureCensus` is the one that misled a reader;
  `domCensus` and `mediaCensus` are read in the same call and pushed in the same place, and nobody had yet
  asked them the question.

  **What it cost.** Comparing `structureCensus.atMs` against the first sweep's mark to decide which side of
  #699 five IKEA captures fell on produced *"#699 isn't in any of them"* — it is in three. That reading
  closed #800 with the wrong mechanism (#850 corrects it) and blocks #844. **The field used to date the
  instrument was the field the instrument misreports**, and it agreed with the reader until it didn't.

  **The fix is a new field, not a corrected one.** `atMs` keeps meaning what it has always meant: correcting
  it would make old and new records look alike while meaning different things, and no correction reaches a
  capture already on disk. Each census mark now carries `readAt: { startedAtMs, tookMs }` — the start *and*
  the duration, because a read is an interval and only the pair says how wide it is. Consumers gate on the
  PRESENCE of `readAt`; `populationVerdict` (#850) is the consumer this unblocks.

  **Nested, not flat, and that is load-bearing.** `censusElementCounts` and `censusFromDiagnostics` build
  the element counts by taking every numeric field on the mark except `event` and `atMs` — a denylist. A
  flat `readAtMs: 3200` would have arrived downstream as an element type named `readAtMs` with 3,200 of
  them. A test in `packages/evidence` pins the other end of that agreement, so flattening it breaks where
  the damage would be done.

  **`createDiagnostics` had two copies and they were about to disagree.** It lived in `capture-core.mjs`
  and `capture-setup.mjs`, duplicated deliberately to avoid an import edge that does not exist — both files
  already import `capture-pure.mjs`. It lives there now, as one exported function, which is also what makes
  it drivable by a test: the guard proves the fault is real by marking a value read 25 ms earlier and
  asserting the two moments differ, rather than describing that in a comment.

  **Not an evidence change.** Diagnostics are not evidence: no announcement, no `structure`, no
  `interaction` moves. `CAPTURE_PROTOCOL_VERSION` is untouched and no cached capture is invalidated — older
  records simply lack `readAt`, which is the state the consumer already handles.

  Checked and not in scope: `markPageState` already marks immediately after its read and carries `tookMs`,
  so its `atMs` is honest — it is the pattern this copies.

- **A probe's comment says what it READS, and nothing compared that against the calls it makes.**
  `probeDisclosure`'s said *"We RE-READ the control… Re-reading asks the accessibility tree instead"*; the
  code calls `reportCurrentFocus`, so `after` is whatever holds focus after activation. The two coincide
  whenever activation leaves focus where it was — true on 2,000+ corpus captures, false on a nav menu that
  moved focus into what it revealed, where the judge asserted 4.1.2 across two different controls.

  `probe-comments-match-their-reads.test.ts` classifies every probe function three ways: `no-claim`,
  `consistent`, `contradicted`. Only the third fails, because "makes no claim" and "makes a claim that
  holds" are different facts and a guard that conflates them reports the wrong population.

  **The row's population figure is corrected rather than repeated.** It said "13 claims across 15 probe
  functions". Measured here: **15 probe functions, 28 lines anywhere in the file matching the phrase sweep,
  and 2 probes whose own comment makes a READS claim.** The 13 was a count of matching LINES — the search
  space, not the finding, the same distinction `bounded-window-reads.test.ts` had to draw. **That is not a
  smaller problem than the row described**: one of the two claims was wrong, it survived 2,000+ captures,
  and nothing in the tree could see it.

  **Delegation is followed one level.** `probeToggle` and `probeTaskButton` are one-line dispatches to
  `activateAndCaptureDelta`, so a body-only scan sees them read nothing and would call any claim they make
  contradicted. A scanner that cannot tell "reads nothing" from "reads through a helper" produces a false
  accusation — measured: with delegation-following disabled, a claim on `probeToggle` is reported as a
  defect that is not there.

  **The floor asserts about the search.** Every other assertion is satisfied by finding fewer probes, so the
  fifteen are written out by name; a renamed or deleted probe fails loudly rather than shrinking the
  population silently.

  Not in this change: correcting the comments the guard classifies. It finds one `consistent` claim and no
  `contradicted` one today — `probeDisclosure`'s was corrected by #812 — so there is nothing to fix, and
  each future correction is its own change with its own evidence.

- **`probeFocusOrder` reported `cycled` at 14 stops and `truncated` at 90 on the same requested URL ten
  minutes apart, and the two walks were on different websites.**

  ```
  capture    stops  verdict     the document the walk actually ran on
  12-49-29     14   cycled      accounts.google.com/v3/signin/identifier
  12-59-26     90   truncated   calendly.com/scheduling
  ```

  Across the eight calendly captures on disk the split is **4/4 with no exception**: every `cycled` walk ran
  on Google's sign-in page, every `truncated` walk ran on a calendly URL. `probeConfiguredForm` activates
  "Continue with Google" and the focus probe runs afterwards — the #685/#691 mechanism, one probe further on
  than the census fix (#699) reached.

  **The census cannot contradict it and is not wrong to fail to.** It reads at t≈0 and correctly reports
  `targetMatch: matched` for calendly; the walk happens ~300 s later somewhere else. Every mark is truthful
  about its own moment, and the capture as a whole reads as one page.

  **So the `focusOrder` mark now records which document it walked.** `pageState(focus)` (#758) already
  fingerprints it, but as a separate mark joined to this one only by ordering — and 2.1.1, 2.1.2, 2.4.1,
  2.4.3 and 2.1.4 all read `focusOrder` as evidence about the requested page. The URL is read **before** the
  first Tab, for the reason `censusBeforeNavigating` is where it is.

  **The row's hypothesis is refuted, and stating that is part of the answer.** It expected `cycled` at 14 to
  be a FALSE COMPLETION, since `focusOrderCycled` compares phrases — the ambiguity `sweepInDirection`
  refuses in its own comment. Measured on **all 16 `cycled` verdicts in the corpus: every one is a genuine
  ring return**, the opening three phrases appearing at exactly two indices, `0` and `length - 3`, never in
  the middle. The ambiguity is real and nothing in the corpus shows it firing, so nothing is changed on
  suspicion.

  **And the same table forced a second finding.** IKEA reports `stops: 0` on every capture with `cycled`,
  `stalled` and `truncated` all false — three booleans over four loop exits, so "the first Tab announced
  nothing" and "this page has no tab stops" arrived identically, beside the same capture's
  `focusConfinement` mark reporting `controlsOnPage: 265`. The walk now records **why** it ended
  (`cycled`/`stalled`/`silent`/`deadline`/`cap`), and `sweepOutcomes` reports a `silent` walk so 2.1.2 and
  2.4.3 get a `cantTell` instead of a clean channel from a probe that never read one.

  `truncated` keeps its exact meaning, derived from the stop reason rather than recomputed, with a test
  driving both formulas over every combination — it is what `sweepOutcomes` turns into the `cantTell` that
  stops 2.1.2 claiming an unearned pass, and narrowing it would quietly convert those into assertions. The
  new outcome gates on the PRESENCE of `stop`: a capture taken before this cannot say which ending it had,
  and inventing truncation in old evidence is the wrong direction to be wrong in.

- **#71's two defects are fixed on `main` already. What was missing is that nothing checked either one, and
  the code said otherwise.**

  `resolvedPageUrl` is module-level, and `pageTarget()` reads it at the TOP of `navigateExisting` — so a
  value surviving from the previous capture makes capture N+1 of page B ask
  `choosePageTarget(expectedUrl = B, resolvedUrl = A)` while the reused window still shows A. **It fails in
  the direction that looks like success**: A is a real URL, so nothing throws and nothing reads as absent.
  `A11Y_REUSE_BROWSER` is on by default, so that is the normal path.

  The fix moved `resolvedPageUrl = null` to the first statement of the function, and its comment said
  *"`browser-session.test.ts` pins the ordering, because a statement's POSITION is the property here and
  moving it back is a one-line edit that changes nothing a type or a lint check can see."*

  **It did not.** Measured: moving the reset back inside the `try`, exactly where it used to be, failed
  **none** of that file's 16 tests. A comment naming a guard that is not there is worse than no comment,
  because it stops the next reader looking — the #842 shape, in the file whose whole subject is a guard, and
  about the one property the comment itself says nothing else can see.

  `resolved-page-url-reset.test.ts` pins it now: the reset is the **first** statement, it precedes
  `pageTarget()`, and it resets to `null` and never to the requested URL — `resolvedNavigationUrl` returns
  the requested URL when nothing redirected, so resetting to it would make "nothing redirected" and "a
  previous capture redirected here" the same value. That is the trap that makes the obvious fix wrong, and
  the row names it explicitly.

  **The row's first defect — the gate comparing with `!==` — is settled rather than assumed.** It uses
  `sameDocument` today, and the comment beside it argues the two cannot differ: the branch is reached only
  when nothing matched `expectedUrl`, so if `resolvedUrl` is the same document, nothing could match that
  either. The argument is sound (`sameDocument` reduces to `normalise(a) === normalise(b)`, and equality of
  a function's outputs is transitive by construction) and it was prose. A test now drives the exact input
  the row predicts — a resolved URL differing from the requested one only by normalisation — and both
  spellings give `fallback`.

  **Still open and not in this change: acceptance 4, the two-page capture.** `evidence:check` samples the
  synthetic corpus, whose pages do not redirect, so the predicted fields were structurally unable to move.
  The designed test is `w3.org/WAI/demos/bad/after/survey.html` and `tfl.gov.uk/modes/tube/`, and it
  **belongs to whoever drives the fleet**.

- **A link sweep reported `exhausted` — the one stop reason this codebase treats as authoritative — after 8
  trips, having found 1 link on a page whose own census counts 79. The report then rendered "every
  structural sweep ran until the page ran out of elements".**

  **The cause is in the capture's own phrases.** The `landmark` sweep before the collapse ends on
  `"Chat Widget, region, ... Open live chat, button, opens dialog"` and then `"Hub Bot, dialog"` — it walked
  into HubSpot's chat widget and left the cursor inside an open dialog. Every sweep that ran while it was
  open exhausted that dialog, truthfully:

  ```
  formField  12 found — every one a chat-widget control ("Ask me anything...", "send message",
                        "Resize widget height or width", "Close live chat")
  graphic     2 found — "Avatar of Hub Bot", "Message History ... Avatar of Hub Bot"
  link        1 found — "privacy policy, link"
  ```

  Then the `list` sweep found the real page's 22 lists and the `frame` sweep saw the widget as
  `"... opens dialog"` — closed again. **Nothing was wrong with the page, the worker, the build or the
  sweep**, and the same capture's `heading` sweep found 28, exactly as the healthy captures did.
  `exhausted` is NVDA's own "no next link", and it is true about wherever its cursor is. This is #863's
  finding one probe over: a verdict about a scope nobody recorded.

  **The check names the number it compares and needs no threshold: a sweep cannot have visited more elements
  than it made trips.** 8 trips against a census of 79 is arithmetic. `ranOutShortOfTheCensus` reports every
  sweep whose directions both ran out while its total trips fall short of the same capture's census for that
  type, and Requirement 2 withholds the full-page sentence, naming the numbers:
  *"link (1 found in 8 trips, census 79)"*.

  **It withholds a claim rather than asserting incompleteness, and the sentence says so.** The census counts
  AX nodes in roles a quick-navigation key may never reach — #800's finding about `formControl` and `f` — so
  short trips do not prove anything was missed. They prove the affirmative claim is not supported.
  Withholding needs doubt; asserting needs proof.

  **This is already on disk, and not rarely.** Run over every capture in one checkout's `runs/`, **14 of 32
  captures would lose the full-page claim** — including four captures of `theregister.com` reporting
  `link 0 found in 6 trips` against a census of **788**, each of which currently renders a full-page
  completeness sentence. *That reads a local copy of `runs/`, so it is a PRE-CHECK: the authoritative number
  belongs to whoever drives the fleet and the lab.*

  Gated on the presence of `prevTrips`/`nextTrips`: a capture that does not record them cannot answer this
  question and is not made to. Only sweeps whose BOTH directions ran out are considered — a half-exhausted
  sweep is already truncated and `truncatedSweeps` reports it, and counting it here would report one
  capture's incompleteness twice.

- **A row's Acceptance saying `npm test` is now refused at FILING, by the same function that refuses it at
  PR time.**

  `pr-open` already caught the only instance — *"needs `corpus`, which this job does not have —
  abstention-regression.test.ts requires corpus via compareAtFloor"*. The acceptance job has no token and no
  corpus and runs commands taken from a body, so the whole suite is not something it can run. **A row's
  acceptance is written before anybody knows which job will run it**, which is why it has to name the files
  the change is verified by rather than the command a developer would type. Asking at filing puts the cost
  on whoever still has the context; by PR time it is a rewrite of a section written hours earlier by
  somebody who has moved on.

  **One implementation, and that is the change rather than a side effect of it.**
  `template-fields-rule.mjs` imports `runsTheWholeSuite` and `extractAcceptanceSection` from
  `acceptance-commands.mjs` unchanged, so the same command string gets the same answer at both times. A test
  drives both entry points over the same strings and asserts they agree — with a guard that the string list
  contains both verdicts, since "they agree" is satisfied by a list where nothing is the whole suite.

  **Only the command-shape half lifted, deliberately.** `jobCapabilities(body)` and
  `unmetCommandRequirements` read a PR body and the capabilities a job declares; at filing time there is
  neither, so the requirement half stays where it works. A weaker second copy of a check that already works
  is the defect this row exists to avoid.

  **The constraint that was expected to decide the shape does not apply, and that is now asserted rather
  than remembered.** The row was scoped around `template-fields-rule.mjs` being a pre-install entry — where
  an `@a11ign/*` import is refused, and `region-paths.mjs` was extracted rather than imported for exactly
  that reason. Measured: `row-file.mjs` and `row-claim.mjs` are invoked by no workflow at all, so neither is
  a pre-install entry and the direct import is available. A test fails if a workflow ever invokes one, and
  says what to do about it.

  **It fails by MISSING, and the limit is stated in the code.** `runsTheWholeSuite` is a positive test for
  two spellings, `npm test` and `npm run test:ts`. A third spelling of the same thing — a shell alias,
  `npm run test --workspaces`, a Makefile target, `node --test` with the glob written out — reads as "not
  whole-suite" and is then classified by the files it names, which for a command naming none is nothing to
  check. Moving the check earlier moves that miss earlier too. It stays silent rather than inventing data,
  and the honest remedy is a check on what a command RUNS rather than a longer alternation.

  Presence and content stay separate refusals: a row with no Acceptance is refused as missing it, never as
  naming the wrong command.

- `npm run lab:full-page-claims` counts how many real-page captures lose Requirement 2's full-page claim
  under #894's `ranOutShortOfTheCensus`, and names the sweep that withheld it, per page.

  Added as a lab job (`lab:job -e job=full-page-claims`) rather than a local script, because it reads
  `runs/real-page-corpus`: a copy in any other checkout is only as fresh as its last sync, so a corpus-wide
  count is a verdict only when the lab runs it. That is CLAUDE.md's "a gate that reads `runs/` is not yours to
  report", and this is what lets the rule be obeyed rather than worked around with a loop over SSH.

  Counts "cannot say" separately from "says no": captures with no usable census, and captures predating #887's
  `trips`, are reported as their own totals rather than folded into the clean or the failing side.

- **A sweep now records what it was sealed inside, so `exhausted` in a dialog stops reading as `exhausted`
  on the page.**

  #887 stopped the report claiming a full page over a collapsed sweep, by comparing trips against the
  census. That is the consequence. **This is the cause**: on `runs/781-r1-hubspot.json/capture-1` the
  `landmark` sweep's last stop is literally `"Hub Bot, dialog"` — it walked into HubSpot's chat widget and
  left the cursor inside an open modal. A screen reader's quick navigation is confined to one, so every
  sweep that ran while it was open exhausted the DIALOG, truthfully: `formField` 12 chat-widget controls,
  `graphic` 2 Hub Bot avatars, `link` 1 against a census of 79. Then the dialog closed, `list` found the
  page's real 22 lists, and the same capture's `heading` sweep found 28 — as many as the healthy captures.
  **Nothing was wrong with the page, the worker, the build or the sweep.**

  The DOM census reports `openDialog`: the **name** of an open modal, or `null`. `markPageState` already
  fingerprints the document before each sweep (#758), so it returns what it read and `collectByType` puts
  the scope on the `sweep` mark itself — **no extra round trip**, and the verdict and the scope it is about
  are one record rather than two joined by position (#863's finding). `ranOutInsideADialog` then withholds
  Requirement 2's full-page sentence, naming the dialog: *"these sweeps ran out of the DIALOG rather than of
  the page: link (inside "Hub Bot")"*.

  **A string, never a count**, and that is load-bearing: `censusElementCounts` builds the element counts
  from every numeric field on a census mark except two, so a numeric `openDialogCount` would arrive
  downstream as an element type. A label also points a reader at the thing to go and look at, where a `1`
  does not.

  **Modal only.** A `role=dialog` without `aria-modal` does not seal quick navigation, and `<dialog open>`
  is not `showModal()` — only the second matches `:modal` and only the second is inert-backed. Reporting
  either would mark sweeps that were never confined, which is the false-accusation direction.

  **Measured on the captures on disk, and the answer is a partial correlation rather than a rate.** By
  inference from phrases (the field itself exists on no capture yet), a sweep ends on a dialog announcement
  in **9 of 33** captures — eight of them calendly's cookie banner. Cross-tabulated against #887's
  trips-short check: **5 end in a dialog and later sweeps run short, 4 end in a dialog and the later sweeps
  are fine, 7 run short with no dialog at all.** So the mechanism explains at most 5 of 12 collapses, the
  phrase evidence over-reports because `role=dialog` is not `aria-modal`, and **7 collapses have another
  cause still unaccounted for**. *A local `runs/` copy, so this is a PRE-CHECK; the authoritative figure is
  the fleet operator's.*

  **A worker deploy is required before any capture carries the field**, so the fixture proves the defect
  happened and the synthetic-DOM test proves the field detects it — joining them needs one capture taken
  after the deploy.

- **Two changes that #922 was approved with and merged without** — the PR merged between the reviewer's note
  and the commit answering it, so they arrive here instead.

  **`checkVisibility` now runs on BOTH dialog branches of the DOM census.** It was explicit on the
  ARIA-modal branch and implied on the native one. `:modal` normally does imply rendered — a top-layer
  dialog — but `showModal()` followed by `display: none` stays `:modal` and shows nothing. The stronger
  reason is worker-judge's: **a check explicit on one branch and implied on the other is a difference the
  next reader has to reason about**, and it costs nothing to not make them. A test covers the native case.

  **And the asymmetry sentence in `ranOutShortOfTheCensus` is sharpened** — *"Withholding needs doubt;
  asserting needs proof"*, with what each direction costs when wrong: being wrong here costs a claim nobody
  was owed, while being wrong the other way puts a completeness sentence over a page that was never read.
  Deferred from #894 for the next change touching that function rather than shipped as a PR that rewords a
  comment.

  Comment and guard only; no behaviour change beyond the `display: none` modal case.

- **#844 closes on "still no, and here is the number" — a bound rather than an absence.**

  #800 asked whether IKEA serves 265 form controls or the sweep walks more than is there. #850 refused any
  verdict because no capture recorded WHEN its census was read; #854 added `readAt.startedAtMs` so they
  could. **The answer that unlocked is worse than unknown: on the 14 captures now carrying it, the census
  lands at 28–67 s and the `formField` sweep walks at 37–280 s.** Knowing both moments proves they are not
  the same moment. A gate that opened merely because the moments were recorded would have read *"we can see
  the gap"* as *"there is no gap"*.

  **The control the row named is what opens it instead.** `heading` carries no `onItem`, so the sweep
  changes nothing, and a heading is a heading in the DOM, in the accessibility tree and to NVDA alike — no
  role argument reaches it. **A `heading` ratio of exactly 1 is direct evidence the page did not change over
  that interval**, whatever its length, and it replaces a threshold on time that somebody would have had to
  choose. `populationVerdict` now refuses without it; every row carries `sweptAt` and `apartMs`, so the
  comparison is labelled at the point it is produced rather than in a document.

  **A ratio below 1 is not a shrinking page.** hubspot's `heading` reads 0.04 — the sweep was sealed inside
  a chat dialog and exhausted it (#897). The control returns "could not report" rather than answering about
  the page, so a reader is not sent looking for growth that never happened.

  **Acceptance 3 reproduced, and gained a control the row did not have.** The heading gap is positive on
  salesforce (+5) and ikea (+11), and **exactly zero on eight w3.org captures** — the census and the sweep
  agree precisely when the page holds still.

  **And the row's first option is refuted by measurement.** The DOM census beside the AX one:

  ```
  capture       DOM formField    AX formControl    sweep found    heading ratio
  ikea                     51               136            270             1.16
  salesforce                7                18             27             1.11
  tfl                    1392                15             34             1.00
  w3.org                   15                15             15             1.00
  ```

  **On ikea and salesforce the AX bucket is already wider than the DOM's form elements** — 136 against 51 —
  so widening `FORM_CONTROL_ROLES` moves the denominator further from the page. **And tfl rules out page
  growth on its own**: `heading` reads 1.00 while `formField` reads 2.27, with 1392 DOM form elements above
  both. Three instruments, three populations, on one still page.

  The decision is recorded where the census is defined: option 1 refused, option 2 cheap and unable to
  attribute, and **only recording the role each announcement came from can tell a narrow bucket from a
  growing page** — the successor row.

- **`fleet:status` no longer prints CONSISTENT over a subset of the fleet.**

  It compared only the boxes that answered and printed `fleet CONSISTENT` over them, with the reachability
  count on a separate line — so a reader saw a verdict and a count as two unrelated facts. **An unreachable
  box that has drifted read as agreement.** Measured: the status said CONSISTENT over nine boxes while the
  tenth, excluded for not answering, was `a11y-worker-4` on Windows `10.0.26200` against the others'
  `10.0.22631`. The OS is a capture-cache key, so the fleet was not one fleet, and five captures (#29) were
  taken on the divergent box before anyone noticed.

  **The verdict now carries its denominator and has three states, two of which must not collapse:**

  ```
  fleet CONSISTENT across 10 of 10 — these workers are interchangeable for capture
  fleet UNKNOWN — the 9 compared agree, and 1 of 10 could not be compared …
  fleet INCONSISTENT across 4 of 4 — windowsVersion differs …
  ```

  "Nine agree and one did not answer" is a box to reach; "they disagree" is a fleet to re-provision.

  **The denominator is the number COMPARED, not the number that answered — the same defect one level
  down.** `fleetConsistency` drops a guest that reports no `environment` before comparing, so a box can
  answer `/health` and still not be in the set the verdict is about. It now returns `compared` (additive;
  `doctor` and the existing tests read only `consistent` and `mismatches`), and the verdict is denominated
  by it. Denominating by the reachable count would have fixed the instance and left the class.

  **The JSON field `consistent` is renamed `comparedAgree`**, and a `verdict` object carries the answer. A
  bare `consistent: true` over nine of ten is the exact misreading this fixes, one serialisation away; no
  code in the repository read the old field.

  `doctor`'s own fleet check already said "N of M guests agree … the rest could not be asked" — it learned
  this first, and the command whose whole job is to describe the fleet never did.

- **A tree-walking guard can now declare the subtree it walks, and its own run proves the declaration.**

  `alwaysRunTests` runs every guard whose population is discovered from the tree, on every pull request,
  because a file added anywhere can join such a population. That stays exactly as it is. Measured by running
  all 131 always-run guards under the new observer: 38 walk the whole repository and 69 read inside a product
  package, but **24 read nothing a product diff can touch**. Six of those read nothing outside their own
  imports at all, and five of the six are flagged only because they import `packages/agent-org/src/ready-label-audit.mjs`,
  whose `run("git", ["for-each-ref", …])` the static predicate reads as a walk.

  A guard may now write `export const WALK_SCOPE = ["docs"];`, and `narrowByDeclaredScope` leaves it out of a
  run whose diff touches none of it. **Undeclared means unbounded**: a guard that says nothing is kept on
  every diff exactly as today, because the failure mode of a wrong narrowing is a guard that silently stops
  running. The narrowed guards are reported **by name** beside `alwaysRunCount`, never folded into it.

  **The declaration is checked by the guard's own run, never trusted.** `packages/guards/src/walk-scope.mjs`, imported
  first, records every path the process lists, opens or tests — sync, callback and `fs.promises` alike, plus
  `git` by its pathspecs. **A read it cannot see fails closed**: any other child process, a shell pipeline, an
  unknown `git` subcommand and a listing of the repository root all count as the whole repository.
  `declareWalkScope` fails the guard's own test file if anything it read lies outside what it declared. The
  check runs exactly when the guard runs, at no extra process cost.

  **First batch: five guards, all outside the triage churn** — `verdict-adoption`, `recorded-provenance`,
  `real-page-corpus-freshness`, `capture-body-owner` and `merge-method-is-one-fact`. On a product diff the
  always-run set goes from 131 to 126; on a `scripts/` diff the lab-scoped four are left out and the
  `scripts/` one stays. The other 19 bounded guards are a follow-up: most live in
  `packages/lab/src/packaging/`, where the open guard-triage rows are still deciding what to delete.

- **A landmark sweep that stopped fewer times than the page has landmarks is now reported as short, even when
  none of its announcements could be read as a landmark.**

  It used to read "cannot say", and a finding treated "cannot say" as a full examination. On a page whose
  named form Edge 152 announces as a "section", the sweep stopped once where the page has two landmarks, and
  a criterion could pass as if the page had been examined in full. It now reads as short, so the pass is
  withdrawn to "can't tell". A sweep that stopped as many times as there are landmarks, or more, still
  reads "cannot say": a stop is not always a landmark, and counting stops would invent a complete sweep.

- The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.

- **When a probe's activation takes the browser off the page's site, a11ign now ends the examination there.**
  That includes a new window or tab, or a URL on another origin. Nothing observed after that point is reported
  as the page's.

  **What a report says about it.** The log line reads `examination ENDED -- left the site at "<control>"`
  before the finding count. The summary leads with the same, and Conformance Requirement 2 names what was not
  examined. The JSON result carries a new top-level `leftSite` naming the control, and where the browser went
  when that is known.

  **Controls inside an embedded frame or object are no longer activated.** On the page the docs recommend,
  `https://www.w3.org/WAI`, the probe used to open the W3C's embedded YouTube player. Every sweep after it ran
  on youtube.com, and its one serious finding was reported against w3.org.

  **For the published types:** `@a11ign/evidence` exports `leftSite()` and `withinTheSite()`, and
  `CaptureInteraction` gains an optional `leftSite`. A capture made before this is still recognised from its own
  announcements ("Opening new window").
