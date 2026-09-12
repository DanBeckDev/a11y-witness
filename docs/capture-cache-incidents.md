# Capture Cache Incidents

Incidents where a capture cache-key input — `browserVersion`, `guidepupVersion`, `screenReaderSettings` —
lied, drifted, or was silently memoised stale. Moved out of CLAUDE.md verbatim during the #458 split.

### A cache key that was MEMOISED, and lied for five days

**Edge updates itself under a running worker, and `browserVersion` did not notice.** The worker read it
through `bootConstant`, whose comment stated the premise outright — *"an executable's version (updating Edge
or NVDA restarts this process)"*. Nothing makes that true: Edge's updater replaces files on disk and the
worker is a separate scheduled task. Measured on a11y-worker-2, same box both sides:

```
/health.environment.browserVersion   151.0.4129.93    uptimeMinutes 7205 (5 days)
msedge.exe on disk                   151.0.4129.101   written 20 Aug 12:13 — four days INTO that uptime
```

So captures were stamped with a version they were not captured under, and **shared a cache key with
evidence from a different browser build** — the exact failure the key exists to prevent, arriving through
the memo instead of through the key. `fileProductVersion` now memoises on the file's identity (path, mtime,
size); the memo's purpose was never the version but keeping a blocking PowerShell child off polled
`/health`, and a `statSync` preserves that.

**Two lessons worth more than the fix.**

- **It defeated the check that was built for it.** `browserVersion` is the FIRST entry in
  `fleet-consistency.mjs`'s `MUST_MATCH`, with exactly this rationale — and every guest reported the same
  stale `.93`, so a split fleet looked consistent. The moment the memo was fixed, `fleet:status` said:
  `fleet INCONSISTENT — browserVersion: .107=151.0.4129.101 .59/.175/.224=151.0.4129.93`. **Only ONE guest
  had actually updated.** A correct check fed a value that cannot express the fault is not a check.
- **A deploy would have HIDDEN it.** Restarting a worker rebuilds the memo, so a correct version after a
  deploy proves the restart worked and vouches for nothing. Hence `file-version-memo.test.ts`, which drives
  an injected `stat`/`read` off Windows — the `refreshBrowseBuffer` rule applied to a value rather than a
  remedy.

**Edge's auto-update policy never applied, and the reason is documented.** `UpdateDefault=0` and
`AutoUpdateCheckPeriodMinutes=0` read back correctly on all four guests and worker-2 updated anyway. Twelve
EdgeUpdate policies — `UpdateDefault`, the per-app `Update{56EB18F8-…}` and `TargetVersionPrefix{…}` among
them — carry the same line in [Microsoft's docs](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-update-policies):
*"available only on Windows instances that are joined to a Microsoft Active Directory domain."* **These boxes
are standalone.** So the values are stored and never honoured, and `policy.yml`'s read-back — the "prove it"
half of every other concern in that role — could only ever prove they were STORED. A verification that
cannot tell *set* from *in effect* is this repo's usual defect one layer further out.

**So the build is pinned instead** (`roles/worker/tasks/edge-version.yml`): declared in
`worker_edge_version`, installed from Microsoft's enterprise MSI by SHA256, and the updater's scheduled
tasks and services stopped and disabled — the only lever that works on a non-domain-joined box.

**Installing Edge takes three steps, and the middle one is not optional.** A Chromium install stages the new
launcher as `new_msedge.exe` and leaves `msedge.exe` alone, because the running browser holds it; the rename
is a separate operation performed later **by the updater we just disabled**. Measured on a11y-worker-3:
`win_package` reported success and left `.93` in place, a **full reboot did not complete it**, and
`setup.exe --rename-chrome-exe --system-level` finished it in one call. So: stop Edge, install, rename.
Note also that Edge's own ClientState `pv` read `.101` while the binary read `.93` — the vendor's
bookkeeping disagreeing with the file, the same shape as the memo above. **Trust the binary.**

And gate the rename on the VERSION being wrong, never on `install is changed`: once an earlier attempt has
installed the MSI, `win_package` is a no-op reporting unchanged, so a `changed`-gated follow-up skips and
the box stays on the old build while the play reports success.

Note `/diagnostics.edgePolicy` reports only `StartupBoostEnabled` and `BackgroundModeEnabled`, so the update
policies it does not read cannot be seen to drift there either — though on a standalone box they were never
the mechanism anyway.

**Consequence for a corpus run: check `fleet:status` for consistency BEFORE starting one.** Two guests on
different Edge builds must never share a cache entry, and the corpus on disk is already cache-invalid
against every guest — `provenance.browserVersion` on the 18 Aug captures reads `151.0.4129.86`, a value
that was itself produced by the memo and therefore cannot be trusted to describe what those captures ran
under.

- **Bump `CAPTURE_PROTOCOL_VERSION`** (`packages/nvda-worker/src/capture-core.mjs`) when a change alters what
  the evidence *means* — a new field a signal reads, a probe that announces differently. It forces a
  full recapture; that is the point. Do **not** reach for it on a refactor.
- The worker's code hash is deliberately **not** in the key. It changes when a comment changes, and
  invalidating 1,061 pairs over a reworded comment is how a cache gets switched off. A cache hit whose
  code hash differs is logged, not hidden.
- Reuse is **per case, never per variant**: a pair is only comparable if both halves came from the
  same worker.
- **Acceptance and repeatability runs never cache.** `DATASET_KIND=acceptance` refuses it outright,
  because those runs exist to test whether NVDA's output is still stable. `--no-cache` anywhere else.

```bash
npm run training:repeat -- --url=<page> --times=5 [--probe-tables]   # is a field stable at all?
node packages/lab/scripts/bench-capture.mjs --from-disk                          # p50/p95 per phase, per worker
```

### THE BROWSER VERSION IS EVIDENCE TOO, and Edge 152 proved it by renaming a container

`browserVersion` has been a capture cache key and the FIRST entry in `fleet-consistency`'s `MUST_MATCH`
for a documented reason — *"a fleet can have more than one image"*. On 2026-09-05 it stopped being a
precaution and became a measurement.

Same page, same NVDA (2026.1.1), same guidepup (0.31.0). Only Edge moved:

```
Edge 151.0.4129.59    "form, name at example dot com, edit"
                      "out of form, heading, level 1, Booking confirmation"
Edge 152.0.4191.66    "section, name at example dot com, edit"
                      "out of section, heading, level 1, Booking confirmation"
```

**The cause is a SPEC ALIGNMENT, not a browser bug.** [`w3c/html-aria#423`](https://github.com/w3c/html-aria/issues/423)
made the `form` role conditional on an accessible name, the way `<section>` already was: a form nobody
named is not a landmark, so it maps to generic and NVDA announces "section". **Every corpus form is
unnamed**, so all of them moved at once.

**The gate caught it and cost 4.9 hours to say so.** `check-signals` reported 39 blind and 5 contaminated
and stopped `migration-verdict` at stage 4 of 13 — with the capture itself clean, 1,623 captured and 0
failed. That is the design working: a browser upgrade changed what an unchanged page SAYS, and nothing
reached a model.

Three things follow, and the third is the one that generalises:

- **`section` is now in `CONTAINER_ROLES`.** It is a container by NVDA's own account rather than by our
  classification — it announces entry (`"section, …"`) and exit (`"out of section"`), which is what every
  other member of that list does.
- **The grammar must keep understanding OLD announcements.** 3,246 captures on disk carry `"form, …"`, and
  a parser that only reads the current browser cannot read its own corpus. Both shapes are pinned in
  `announcement.test.ts`.
- **A hand-rolled prefix strip survives a grammar fix.** `placeholderOnlyIsPresent` stripped `^form,` by
  name, so the grammar change did not reach it — and `announcement.ts`'s own header lists that failure
  among the four it was written to end: *"signal regexes broke whenever a container prefix appeared in
  front of the text they matched"*. **When a container word changes, grep for the WORD, not just for the
  grammar** — the same shape as fixing a behaviour at one call site when it reaches several.

**Before a corpus run, check `fleet:status` for consistency AND know which Edge you are on.** Following the
pin forward is this fleet's policy and it is right; what this records is that doing so is an EVIDENCE
CHANGE, to be paid for with a recapture and a gate run, never slipped in beside unrelated work.

### guidepup is pinned at 0.31.0, and the version is EVIDENCE

See `docs/adr/0033-guidepup-exact-pin-is-evidence-not-dependency-hygiene.md` for the decision itself — the
caret range it rejects and what would change it. What follows here is the incident that forced it.

`guidepup` parses NVDA's speech before this project ever sees it, so its version changes what a capture
says. Upgrading 0.29.2 → 0.31.0 fixed an intermittent OBJECT REPLACEMENT CHARACTER (U+FFFC) that had
been appended to form-field announcements at 3–31% of affected captures for weeks — measured 1 in 15
before, **0 in 15 after**. See `docs/ufffc-investigation.md`, including the seven theories that were
wrong so nobody re-runs them.

Consequences, all of which are now enforced:

- **`guidepupVersion` is in the cache key** (`capture-cache.mjs`) and in the fleet-consistency check
  (`fleet-consistency.mjs`). Two guests on different versions produce different evidence and must never
  share a cache entry. During the upgrade itself the fleet was briefly split, and nothing noticed.
- **0.29 was hiding a bug.** 0.31 throws when `start()` is called on a live NVDA; 0.29 tolerated it. That
  masked real state drift — `screenReader.running` disagrees with reality whenever
  `screenReaderResponds()` misses the Remote port for an instant. A running NVDA is now *adopted*.
- **0.30+ writes a SESSION config** (`sessionUserConfig/nvda.ini`) beside the base one. Anything that
  assumes a single `nvda.ini` is wrong.
- **0.30 added a settings API** — `start({settings})`, `getSettings()`, `getSetting('section.key')`.
  `/diagnostics` reports the effective settings.

  > **THIS LINE USED TO READ "record them; do not tune them — NVDA's defaults are what a real user
  > experiences". That is WRONG, and it was overturned on 2026-09-03.** Screen reader users are heavy
  > configurers: speech rate, verbosity, punctuation and symbol level are all routinely far from default,
  > and an experienced NVDA user runs speech far faster than the shipped setting. A tool that only ever
  > describes an unconfigured user is not describing a real one — "default" was standing in for "typical"
  > and they are not the same thing.
  >
  > **The rule that replaces it: a setting that changes what NVDA SAYS is a CACHE-KEY INPUT.** Not
  > forbidden — keyed, so evidence taken under one setting can never blend with evidence taken under
  > another. `environment.screenReaderSettings` carries the digest, `environmentKey` keys on it, and
  > `fleet-consistency` treats it as MUST_MATCH, exactly as `guidepupVersion` is treated and for the
  > identical reason. `CAPTURE_SETTINGS` in `nvda-logging.mjs` is the list, and every entry states why.
  >
  > What the old rule was RIGHT about is the danger, and the danger is not non-defaultness — it is
  > evidence blending silently. The first entry is **`speech.reportLanguage`**: at NVDA's default a WCAG
  > 3.1.2 failure is announced as a change of VOICE and no text at all, so a pipeline that captures speech
  > as text is structurally blind to it. With the setting on, NVDA speaks the language — measured
  > 2026-09-05 on a real capture, `"Spanish (not supported), La ciudad duerme…"` followed by `"English"` on
  > the way out.
  >
  > **THIS LINE SAID `documentFormatting.reportLanguage` UNTIL 2026-09-05, AND THAT IS THE WRONG SECTION.**
  > `CAPTURE_SETTINGS` was fixed long before this paragraph was, and its comment records the whole episode:
  > written to `documentFormatting` the setting LOOKED applied — `getSettings()` read it back — and NVDA
  > reads it from `[speech]`, so it was inert. *"Verifying that a setting was WRITTEN is not verifying it
  > is IN EFFECT."* The doc kept the refuted spelling in the one paragraph telling you the value is a
  > cache-key input, so anyone following it would have written to the dead section again. Found while
  > chasing an unrelated blind case, not by review.
  >
  > **And turning it on is what made it recordable.** `getSettings()` returns only sections NVDA has
  > actually WRITTEN, so at defaults there is no `[speech]` entry for it at all and "off" is
  > indistinguishable from "never asked" — measured 2026-09-02. You cannot record the setting without
  > first setting it, which removes "we will just note what it was" as an option. `/health` carries the
  > digest instead: `screenReaderSettings: 'speech.reportLanguage=True'`, which is what to read.

  > **SPEECH RATE IS NOT A FREE OPTIMISATION**, and the reason is weaker than the first version of this
  > paragraph claimed — which is itself the lesson.
  >
  > It said §18 had measured that a polite live region NEVER announces, *"because polite means speak when
  > idle and neither moment is idle"*. **That is §18's FIRST headline and it was refuted twice.**
  > `not-working.md` carries FOUR sections numbered 18; the current one opens *"THIS SECTION HAS BEEN
  > WRONG TWICE, AND THE CORRECTION IS THE POINT"* and records that a diagnostic pair — one `polite`
  > region and one `assertive`, same checkbox — saw **both announce**. The settle-window explanation was
  > refuted too: the fix was built, deployed and re-measured, and the rate did not move.
  >
  > **What is actually true is a RATE: a live region reaches the delta 2 times in 6**, on an unchanged
  > page, with the count never moving and only the content changing. **The intermittency is unexplained**,
  > and §18 says so outright — it is the one thing nobody has accounted for.
  >
  > So speech rate remains a plausible variable in an UNEXPLAINED intermittency, not a known mechanism.
  > That is enough to make it worth testing and not enough to make it a fix. The reason it belongs under
  > this rule at all is unchanged: whatever it does, it acts on WHAT IS HEARD rather than only on how long
  > a capture takes, so it is keyed evidence rather than a tuning knob.
  >
  > **And note how this went wrong**, because the shape recurs and the first attempt to write it down was
  > ALSO wrong. Four sections share the number 18, any one reads as current, and each one's reasoning is
  > sound enough to quote. This paragraph originally said *"read to the LAST section with a given number"*
  > — **backwards.** Settled by asking git rather than by reading the layout: the four were committed at
  > 04:41, 18:19, 19:29 and 19:46 on 2026-09-01, and the file carries them NEWEST FIRST. The last one in
  > the file is the oldest claim, and it is the refuted one.
  >
  > **So: `git log -S "<the headline>" -- <file>` decides which of several same-numbered sections is
  > current.** A position in a file is a convention nobody wrote down; a commit time is a fact. This cost
  > two wrong citations in two days, and the second was written into this file as guidance.

Upgrading guidepup is an evidence change: run `npm run evidence:check` and expect a recapture.


## The OS key, provisionRevision, and RUNS_ROOT

- **The OS is in the key because a fleet can have more than one image.** Without it, a capture from an
  ARM64 guest on a developer's Mac and one from an x64 guest on a server are, to the cache, the same
  evidence — so the two blend into one corpus indistinguishably. Whether NVDA announces identically
  across two images is exactly what `npm run evidence:check` answers, and until it has for a given
  pair, the cache must not assume it. `provisionRevision` is an additional guard: older guests that
  have not been re-provisioned still report `"unstamped"`, while the current worker resolves the
  stamp from its checkout rather than assuming a Windows username.
- **Adding `os` to the key invalidated every capture stamped before it**, because `provenance.cacheKey`
  is compared literally. One full recapture pays that off, once; after that caching works normally.
  That is the unavoidable cost of any key change — do them deliberately, and ideally alongside a
  recapture that was happening anyway.

- **`provisionRevision` is stamped by provisioning and read from the guest checkout.** Existing
  guests created before the stamp was introduced report `"unstamped"` until the next deliberate
  redeploy/re-provision. That value is still a real cache key: the first guest to report a real
  revision changes every key it produces and invalidates its cache — the behaviour you want, and
  unit-tested. Re-provision the pool together rather than one at a time so two differently prepared
  guests cannot silently share an `"unstamped"` key.
- **`RUNS_ROOT` / `A11Y_RUNS_ROOT` move where `runs/` itself resolves to** (`packages/lab/src/dataset-paths.mjs`
  is the one place that reads them; every dataset path — the corpus, exports, models — is built on top of
  its `runsRoot()`). Both names are honoured, because both were already in use before either script read
  the other's spelling; set either when `runs/` needs to point somewhere other than `<repo>/runs`, most
  commonly a machine where it is mounted or symlinked from a different path than this checkout's default.
- **`REAL_CORPUS_ROOT` points the real-page corpus alone somewhere specific**, overriding the default of
  `<runsRoot()>/real-page-corpus`. Leave it unset and the real-page corpus follows `RUNS_ROOT` like every
  other root. **The sentence above was not true for this root until #930**: `realCorpusRoot()` resolved
  `runs/real-page-corpus` against the repo root directly, so moving `runs/` relocated the dataset and the
  captures and left the real-page corpus behind — and `capture-real-pages.mjs` writes through it, so on a
  machine with `runs/` mounted elsewhere, captures landed in the wrong tree. Found by pointing `RUNS_ROOT`
  at an empty directory and watching `lab:full-page-claims` report 28 captures from the real corpus.
