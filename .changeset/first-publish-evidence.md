---
"@a11ign/evidence": minor
---

The first published version of `@a11ign/evidence`. Everything below landed before it: the rename first, then oldest first.

- The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
  binary names and every cross-package import specifier change with it (issue #66). Nothing had been
  published under the old name, so this is a rename landing in the tree before the transfer to the
  `a11ign` GitHub organisation, not a migration for existing consumers.

- #168: removed each package's own `"prepare": "tsc --build"`. Nothing a consumer installing the published
  package observes -- `prepare` never ran for a registry install in the first place (only `prepack`, which
  still runs `tsc --build` unchanged, ships the tarball). This only affects `npm ci` inside this monorepo:
  three packages' own `tsconfig.json` reference the same `evidence` project, so npm firing all five
  workspaces' `prepare` scripts concurrently could start several independent `tsc --build` processes writing
  to `packages/evidence/dist/*` at once -- a real file-write race, source of the intermittent `ci/ts`
  failures. The root's own `prepare` now runs `npm run build` once, coordinating the same dependency graph
  through a single `tsc --build` invocation instead.

- #453: `stripComments` (`@a11ign/evidence/source-text`) no longer corrupts a template literal whose
  interpolation contains ANOTHER template literal with an odd total backtick count — a real bug, not a
  hypothetical one: it silently swallowed a whole function body (including a real `refuseUnknownFlags(`
  call) in `scripts/select-changed-tests.mjs`, and a guard reading the stripped output reported an
  already-guarded file as unguarded. `skipInterpolation` now walks a `${...}` interpolation as real code
  (nested strings, templates and comments included) so the true end of the outer literal is always found,
  regardless of what its interpolation contains. The existing, documented limitation — a comment *inside* an
  interpolation is not itself stripped — is unchanged.

  `@a11ign/worker-fleet` adds `command-line-census.mjs`: the tree-walk that discovers every argv-reading
  `.mjs` under this repo's known CLI roots, extracted from `cli-flags.test.ts`'s own census so a second
  consumer asking a different question about the same file population (which scripts declare a runnable
  entry-point, say) can reuse the walk without re-deriving it. `cli-flags.test.ts` itself is unchanged in
  behaviour: it now imports the walk instead of defining it locally, and its long-standing hand-typed
  `GUARDED` registry is replaced by deriving "guarded" from each file's own source (does it call
  `refuseUnknownFlags(`) — a new guarded CLI registers itself by calling the guard, with no census file to
  edit. `UNGUARDED` remains the one hand-typed list, for genuine, reasoned exemptions.

- `npm run witness` now prints an early, in-flight notice within roughly a minute of capture start when a
  page looks like it is heading toward a "contained" doubt (a consent overlay Escape could not dismiss) —
  previously this warning only appeared after the whole capture finished, which could be several minutes
  later with no intervening output.

  The early reading uses the SAME threshold `captureDoubt`'s finished-capture verdict already applies
  (`@a11ign/evidence/verify`'s new `earlyContainmentVerdict`), read off marks the worker's `/progress`
  endpoint already reports — nothing new is recorded by a capture, and no cached evidence is affected. The
  notice is purely informational: it never changes whether or how a capture proceeds, and prints at most
  once per capture. `earlyContainmentVerdict` and its `EarlyContainmentVerdict` type are additive exports.

- The conformance report now distinguishes a structural type that was **never examined** from one that was
  examined and found nothing. A sweep that ran out of time reported the same `0 of 340` as a page with no
  links, and the two need opposite responses: the first means the capture is truncated and every conclusion
  drawn from it is bounded by the same budget. A type that was examined and then ran out is reported as
  partial, which is neither of those. Existing captures without stop reasons are unaffected and continue to
  report as examined.

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

- The consent-overlay doubt is reported as soon as the heading sweep has a result, rather than after every
  structural sweep has finished.

  `earlyContainmentVerdict` read the `structural` mark, which is written only after the heading, landmark AND
  formField sweeps — and `formField` is the expensive one. Measured across the 14 most recent real captures,
  `structural` lands between 23.1s and 402.5s (the latter on a 453-second capture). The heading sweep's own
  `found` is identical to `structural.headings` on all 14, so the verdict is unchanged and only its arrival
  moves: 402.5s to 99.0s on the worst case, 238s to 85s on calendly.

  Additive and fallback-only: a capture with no heading-sweep mark still decides off `structural` exactly as
  before, so no cached capture is invalidated and no protocol bump is needed.

  #426's bar moved with this, from "inside the first minute" to "as soon as the first sweep has a result".
  The minute is unreachable at any gate — `pageState`, the denominator, does not itself land until 61-68s on
  10 of the 14 captures, because the read-through ahead of it is 81-86% of that window.

- #869: `OracleCounts`/`oracleCounts()` now pass through an optional `formInputs` field (form controls'
  `autocomplete` attribute) for 1.3.5 Identify Input Purpose, mirroring `media`'s existing contract exactly.
  Absent on every capture that exists today — no worker-side census populates it yet (issue #170) — so this
  is additive only and changes nothing for an existing consumer.

- `censusElementCounts` and `censusFromDiagnostics` no longer report `candidates` (a fact about how many
  CDP page targets the census's read had to choose from) as an element type. Both readers now share one
  predicate (`censusNumericCounts`) instead of two copies of the same denylist. `graphicUnnamed` and
  `graphicExempted` are unaffected — they are genuine sub-counts, not incidental leakage.

- A sweep that reports reaching the end after finding far less than the page's census is no longer read as
  the page having nothing more. `Completeness` gains `"elsewhere"`, and the new `sweptElsewhere(capture)`
  returns the sweeps it applies to. It covers a link sweep that reached `exhausted` in both directions having
  announced under `LINK_SWEEP_OF_THE_PAGE_FROM` (0.54) of the census's distinct links, on a page with at
  least `LINK_CENSUS_FLOOR` (10) of them. Below that floor the rule does not judge. Something held that
  sweep: a chat widget, a consent overlay, or a cause nobody has read. This is a verdict about coverage, not
  a widget detector. A graphic sweep in the same capture follows the link verdict. The first container the
  sweep announced is reported as a hint, or `null`. `sweepCompleteness` reports the verdict,
  `captureSupports` refuses to support absence and says what held the sweep, and the new `whatHeldTheSweep`
  is the one wording both use.

  `@a11ign/judge` now fails closed. `assertableSweep` and the criterion outcomes treat a sweep as examined
  only when its verdict is `exact` or `unknown` (`EXAMINED_IN_FULL`). Any other verdict, including one added
  later, refuses an absence claim and withdraws a pass. Before this change, a verdict the judge did not list
  fell through to "absence allowed" and "examined in full".

  Nothing changes in what a capture records. A capture is never rejected for this: a keyboard-trap page
  traps its sweeps by design, and that trap is the finding. If you switch exhaustively over `Completeness`,
  add the new case.

- A capture now carries `formInputs`: one `{ tag, type, autocomplete }` entry for each form control on the
  page (`input` except `type=hidden`, `select` and `textarea`). The value is read from the DOM at the same
  moment as `media`.

  - `autocomplete` is the **attribute** as the author wrote it, or `null` when the control has none. It is
    never the normalised property, which returns `""` for a token the browser does not recognise.
  - `null` for the whole field means the census did not run, and `[]` means the page has no form control.
  - A `formInputCensus` diagnostic mark records `count`, `total` (the list is capped at `FORM_INPUT_CAP`) and
    which document was read.

  This is the evidence 1.3.5's rule (`addUnidentifiedInputPurpose`) has been declared against, and it had no
  source until now. `CAPTURE_PROTOCOL_VERSION` moves from 16 to 17, because a new field that a rule and a
  signal read is that constant's trigger. Deploying it needs `--allow-protocol-change` and forces a full
  recapture.

  `@a11ign/evidence`'s `CaptureResult` type now names `formInputs` beside `media`, with the same contract.

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
