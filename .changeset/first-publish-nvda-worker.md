---
"@a11ign/nvda-worker": minor
---

The first published version of `@a11ign/nvda-worker`. Everything below landed before it: the rename first, then oldest first.

- The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
  binary names and every cross-package import specifier change with it (issue #66). Nothing had been
  published under the old name, so this is a rename landing in the tree before the transfer to the
  `a11ign` GitHub organisation, not a migration for existing consumers.

- The hard capture timeout now carries a fault code (`hard-timeout`) instead of an untagged `Error`, so a
  CLI reader gets a plain-language explanation — "the capture ran too long and was abandoned" — instead of
  the generic no-remediation path. The message also names how far a partial capture got (the last recorded
  progress phase, and how many progress marks were recorded) when the worker reported one, so "we ran out
  of time partway through" and "we could not read your page at all" read as the different findings they
  are. Additive on the wire: an older CLI reading a fault code it does not recognise already falls back to
  "no remediation recorded" rather than failing, and an older worker's untagged timeout error is unaffected
  by either side of this change.

- The Windows worker's checkout, its shared `ProgramData` directory and Edge's capture profile are named
  again as they are on the machines. The rename (#66) moved the strings in the tree; it did not move the
  directories on the guests, so the worker's profile resolution and every provisioning script pointed at
  paths that do not exist — and a successful deploy would have created a fresh, unwarmed browser profile
  beside the real one. `A11Y_REPO_PATH`, `A11Y_EDGE_PROFILE` and `A11Y_BROWSER_PROFILE` still override and
  are unaffected.

- The browser profile a capture ran against is now part of the capture cache key and a fleet-consistency
  field. A cold profile and a warm one are different evidence — a fresh user-data-dir shows the browser's
  first-run surface, which the screen reader can record as page content, and a learning profile changes
  what form fields announce. Existing profiles are ADOPTED rather than treated as changed, so no cached
  capture is invalidated by this shipping; only a genuinely new or wiped profile moves the key.

- `/progress`'s `phases` array now echoes every field a diagnostic mark carries (e.g. `structureCensus`'s
  heading/landmark counts), not just `{event, atMs}`. That detail was already being recorded in memory on
  every capture; this endpoint was discarding it at the final response step. Purely additive: existing
  consumers reading `event`/`atMs` see no change, and the response only ever reports what was actually
  observed, never a heuristic verdict computed from it. Does not change `CAPTURE_PROTOCOL_VERSION` (nothing
  about what stored evidence means has changed), but does change `codeVersion()` since `server.mjs` is
  hashed — deploy with `fleet:deploy` before relying on this over HTTP.

- `waitForSpeechQuiet` no longer treats a FAILED read of the speech log the same as a genuinely empty one.
  Previously, `.catch(() => [])` folded a query failure (a timeout or a dead speech channel) into the same
  length it used for a real quiet read — so a channel that stopped answering could report `quiet: true`
  after one settle window, indistinguishable from NVDA genuinely finishing speaking. This is a bug fix on
  the FAILURE path only: a normal capture, where every read succeeds, behaves byte-identically, so no
  cached evidence is affected. Only a capture that hit a genuine speech-channel read failure during a
  settle wait could have been mis-timed before this fix.

- `packages/nvda-worker/src/README.md`'s setup instructions now clone the repository's real, currently-resolving GitHub location rather than the post-transfer product name, which does not exist yet — the same fix applied to the top-level README and getting-started guide (#647). No code change; documentation only.

- The `structureCrossCheck` diagnostic mark's `oracleDistinctNames` field for `graphic` no longer
  counts unnamed images as distinct names. On a page with unnamed graphics it previously reported the
  raw element count (each nameless image counted as its own "name"), inflating the reported gap
  against the sweep by however many unnamed images the page has — measured 61 vs. the real 23 on a
  calendly capture with 38 unnamed graphics. Not a wire-protocol change: no capture field is renamed,
  added, or removed, and no host needs to change how it reads a capture. A consumer reading
  `structureCrossCheck.differsOn` for `graphic` will see a smaller, more accurate number.

- Each structural sweep's `observed` record now says where focus sat when that sweep started. It gives one
  of four answers:

  - `focusInFrame: "<frame>"`: focus was inside a nested browsing context (`<iframe>`, `<frame>`,
    `<object>`, `<embed>` or `<fencedframe>`), named by its title, name or id, or else its source's host.
  - `focusInFrame: null`: focus was in the top document.
  - `focusInFrameUnknown: "<why>"`: the page could not say. For example, focus was on a host whose closed
    shadow root page script cannot read.
  - Neither field: the page could not be read.

  The page side is a `focusFrame` value on the DOM census that every sweep already reads, so this adds no
  round trip. It follows open shadow roots to the element focused inside them.

  This is a diagnostic only. It changes nothing a capture does, and no rule or signal reads it, so
  `CAPTURE_PROTOCOL_VERSION` is unchanged. Captures already on disk have neither field, which reads as not
  recorded.

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

- Before the sweeps, a capture now returns focus to the top document when focus sits inside a frame that
  nothing of ours put it in. On #951's page, #953 measured that on 6 of 6 collapsed captures: a chat widget's
  frame held focus before the first probe, so every sweep type walked the widget instead of the page.

  - **The decision.** It is taken once, from the reading `runProbeSequence` already makes before its first
    step, and only when that step is the sweep. Under `probeOrder: focus-first` the Tab walk runs first, so no
    restore happens.
  - **The restore.** It blurs the focused frame and focuses the window through CDP, and adds nothing to the
    page.
  - **The record.**
    - A `focusRestore` diagnostic mark on every capture, either `attempted: false` with the reason, or
      `attempted: true` with the frame.
    - `observed.headings.focusRestored: { from, left }`, where `left` comes from the first sweep's own
      `focusInFrame`.
  - **The backstop.** Any sweep that starts inside a frame is marked incomplete: `complete: false`, with
    `heldBy` naming the frame.

  This is an evidence change, and it shares `CAPTURE_PROTOCOL_VERSION` 17 with #170's `formInputs`.

- The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.

- A capture no longer inherits the previous capture's resolved page URL. The two URLs a capture
  tracks — the one it asked for and the one its navigation landed on — now share a single reset at
  the capture boundary; before, only the first was cleared there and the second was cleared only when
  a navigation happened to run, so a worker serving many captures could carry a stale landing URL
  between them.

- A worker now prefers a provisioning-recorded fact over inference when reporting whether its Edge profile
  was adopted or created fresh. Previously this rested entirely on the presence of Edge's own `Local State`
  file: if Edge stopped writing it, every profile would report as fresh, the cache key would move, and
  nothing would say so. Where no record exists — every profile provisioned before this — behaviour is
  unchanged, so no cached evidence moves. Where the record and Edge's file disagree, the worker logs it
  naming both possible causes rather than picking one.

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
