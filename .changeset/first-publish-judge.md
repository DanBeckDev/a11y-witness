---
"@a11ign/judge": minor
---

The first published version of `@a11ign/judge`. Everything below landed before it: the rename first, then oldest first.

- The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
  binary names and every cross-package import specifier change with it (issue #66). Nothing had been
  published under the old name, so this is a rename landing in the tree before the transfer to the
  `a11ign` GitHub organisation, not a migration for existing consumers.

- The 2.4.2 (Page Titled) `stale-route-title` rule no longer fires on two shapes that read identically
  to a real route change under its "the first heading changed" proxy: a link announced as opening in a
  new window/tab (WCAG's own Understanding text calls this shape structurally inapplicable — activating
  it cannot change this document's title, because no navigation of this document occurred), and a
  heading announced inside a `dialog` container (a modal that just opened, or a consent overlay
  switching panels within itself). Both are read from NVDA's own announcement rather than inferred from
  page content.

  This rule has always mapped `secondary` (`cantTell`, a referral) — it has never asserted a conformance
  failure — so the change reduces false REFERRALS, not false assertions. A genuine stale-title route
  change is still reported exactly as before.

- `CRITERION_COVERAGE["4.1.3"].status` (exported from `@a11ign/judge/internal`) changes from
  `"assessed"` to `"partial"`, with a `needs: ["screen-reader"]` field added. The criterion's note was
  already explicit that only one of its four categories (success/results of an action) is covered --
  waiting-state and progress status messages are not -- and the status field now agrees with it.

  This does not change what the shipped judge asserts: `assessedCriteria()` (the count of criteria that
  produce findings) is a separate, untouched export, and 4.1.3 still ships a finding exactly as before. A
  consumer reading `CRITERION_COVERAGE` directly to distinguish exact coverage from partial coverage will
  now see 4.1.3 correctly classified as the latter.

- #168: removed each package's own `"prepare": "tsc --build"`. Nothing a consumer installing the published
  package observes -- `prepare` never ran for a registry install in the first place (only `prepack`, which
  still runs `tsc --build` unchanged, ships the tarball). This only affects `npm ci` inside this monorepo:
  three packages' own `tsconfig.json` reference the same `evidence` project, so npm firing all five
  workspaces' `prepare` scripts concurrently could start several independent `tsc --build` processes writing
  to `packages/evidence/dist/*` at once -- a real file-write race, source of the intermittent `ci/ts`
  failures. The root's own `prepare` now runs `npm run build` once, coordinating the same dependency graph
  through a single `tsc --build` invocation instead.

- #811: fixed a bug where three or more genuinely distinct 2.4.7 focus-loss findings on the same control,
  occurring close together in time, could silently collapse into one reported finding — the evidence text
  for a repeated focusout carried no timestamp, so `ruleFindings`' own dedup treated identical-looking text
  from different real moments as the same finding. The evidence for this finding now includes the event's
  own timestamp, so a report undercounts less often. No change to any other finding's shape or count.

- `action.yml`'s "the number that matters more on a REAL page" claim was hand-counted and wrong (#171):
  it said TWELVE and named only 3.3.3, 3.2.1 and 3.2.2 as exceptions to `RULE_CRITERIA`, while
  `criterion-coverage.ts` itself already declares `realPageEvidence.available: false` for two more
  rule-owned criteria — 1.4.2 (the probe runs and has simply never observed autoplaying media on a real
  capture) and 1.4.13 (the probe has not yet been turned on for real-page captures). The real count is
  ELEVEN.

  `coverage.ts` exports two new pure functions, `realPageUnfireableCriteria()` and
  `realPageAssessableCriteria()`, deriving the real-page-reachable set from `RULE_CRITERIA` and
  `CRITERION_COVERAGE`'s own `realPageEvidence` field rather than a hand-maintained list.
  `documented-criteria.test.ts` pins `action.yml`'s "still N" number and its except-clause against these
  derivations, so the two surfaces cannot drift apart again silently. `RELEASE.md`'s matching prose is
  corrected the same way.

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

- The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.
