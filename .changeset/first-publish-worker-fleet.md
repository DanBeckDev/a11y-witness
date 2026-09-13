---
"@a11ign/worker-fleet": minor
---

The first published version of `@a11ign/worker-fleet`. Everything below landed before it: the rename first, then oldest first.

- The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
  binary names and every cross-package import specifier change with it (issue #66). Nothing had been
  published under the old name, so this is a rename landing in the tree before the transfer to the
  `a11ign` GitHub organisation, not a migration for existing consumers.

- `doctor` (shipped as `a11ign-doctor` in this package's `bin`) now resolves the exact specifier
  `@a11ign/judge/rules` at runtime to report whose `dist` a cross-package import actually comes from,
  and whether that `dist` is stale relative to its own source. Advisory only — it never changes `doctor`'s
  exit code.

  This makes `@a11ign/judge` a genuine new runtime dependency of this package, declared in
  `dependencies` and in `tsconfig.json`'s `references` for correct build ordering.

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

- #515: `doctor`'s control-plane-isolation check reads the fleet SSH key back at the filename it had before
  the rename (#66). That rename moved the string in the tree; it did not rename the file on anybody's
  machine, so the check was looking for a path that does not exist and reporting the control plane
  COMPLIANT with the key sitting there under its old name. `A11Y_SSH_KEY` still overrides and is
  unaffected — set it if your key is named something else, which is what that variable has always been for.

  The filenames are deliberately not written out here: `tracked-prose-leak-guard.test.ts` refuses a named
  SSH key path in tracked prose, and a changeset is published prose.

- #526: the control plane's checkout directory is named correctly again in the bootstrap systemd unit and
  in `control-plane-isolation`'s reported inventory. The rename (#66) moved the string in the tree; it did
  not move the directory on the machine, so the unit's `ExecStart` pointed at a path that does not exist
  and the isolation report named one nobody could act on.

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

- The local-VM scripts (`worker-ctl.sh`, `fetch-windows-iso.sh`, `build-vm.sh`, `clone-worker.sh`,
  `create-utm-vm.sh`) now refuse to run (exit 1) unless `A11Y_LOCAL_VM=1` is set in the environment, instead
  of printing a deprecation warning and continuing. Capture on the bare-metal fleet (`npm run fleet:status`,
  `npm run fleet:deploy`) instead; set `A11Y_LOCAL_VM=1` to keep using a local UTM VM.

- `doctor --json`'s `next_command` is now a runnable command or `null`, never an English sentence — and a
  check that has advice a shell cannot run carries it in a new `note` field instead.

  **This can change what your automation reads.** `next_command` was always a string, and could be prose:
  a failing `worker` check on a Mac emitted *"unlock the Mac if it is locked, then re-run …/worker-ctl.sh
  pool"*, which nothing can execute — and, on a machine where the local-VM path is deprecated, running it
  reproduced the refusal it was offered for. **Anything that executed `next_command` looped.** It is `null`
  now when no command can be constructed, so a consumer can tell "there is nothing to run, read the checks"
  from "here is what to run". If you interpolate `next_command` into a shell line, handle `null`.

  The remedy for a deprecated local-VM refusal is now `npm run fleet:status` — the command the refusal
  itself names — rather than the script that just refused.

- `doctor`'s `ready` is now computed over the checks a capture run actually needs, rather than over every
  check — so a freshly cloned checkout with a worker configured reads **READY** instead of NOT READY.

  **What changes for a consumer.** `doctor --json`'s `ready` was `checks.every(c => c.ok)`. It no longer is:
  a failing `dataset` check (no training corpus generated) reports its FAIL with its fix and does **not**
  make the verdict NOT READY. Every other check still decides, so a failing `worker`, `judge`, `pages`,
  `run`, `contention`, `isolation` or `dist-*` still reads NOT READY. **If you reconstructed `ready`
  yourself from the `checks` array, your copy and `doctor`'s now disagree** — read the `ready` field.

  Each check declares whether it gates, and adding one without declaring is refused rather than defaulted.

- **`doctor --json` now emits a JSON document when it CANNOT produce one.**

  A check that threw used to exit 1 with **zero bytes on stdout** and the failure on stderr — where a
  `--json` consumer never looks. For a caller, **"could not ask" and "no output" are different facts and
  only the first is actionable**: the second is indistinguishable from a command that was never run.

  On a throw, `--json` now writes to stdout and still exits non-zero:

  ```json
  { "ready": false, "error": "<the real failure text>", "checks": [] }
  ```

  **`error` is present only in this document**, so its presence is the signal that no verdict exists. A
  successful run is byte-for-byte what it was: `ready`, `next_command`, `checks`, no `error` key. **Read
  `error` before `ready`** — a consumer that reads only `ready` sees `false` and cannot tell a
  NOT-READY checkout from a run that died.

  **`checks` is present and EMPTY rather than absent or partial.** Absent crashes a consumer reading
  `.checks[]`. Partial would be worse: it reads exactly like a complete verdict, and nothing in it
  distinguishes a check missing because it passed from one missing because the run died under it.

  `2>&1` is not a substitute and would be actively harmful here: stdout is a parsed format, so redirecting
  stderr into it produces invalid JSON — worse than nothing, because a consumer that parses gets a syntax
  error instead of a document.

  The human (non-`--json`) output is unchanged and keeps the full stack trace.

- The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.

- `npm ci`, `fleet:deploy` and every other place this package resolves npm's own CLI script now also find it through the `npx`/`npm` executable on `PATH`, symlinks resolved. Debian and Ubuntu package npm at `/usr/share/nodejs/npm`, a layout the two fixed candidates (Windows, upstream tarball) never named, so on a machine whose Node came from apt the resolver refused and nothing that spawns npm could run (#1268).
