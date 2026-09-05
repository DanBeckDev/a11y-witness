# ADR 0006: Naming scheme, public npm as the registry, and a licence split

**Status:** accepted
- Date: 2026-08-05

## Context

The repo is AGPL-3.0-or-later and `"private": true`. Publishing changes what the
licence *does*: on a private repo AGPL is a statement of intent, but on an npm
package it becomes a condition every consumer's legal review reads before they
`npm install`. Goal 1 is consumer adoption, and AGPL is the licence most likely to
stop a commercial team adopting a library. That tension has to be resolved
deliberately rather than by carrying the root licence field into six manifests
without thinking.

Registry choice interacts with it. GitHub Packages requires an authenticated
`.npmrc` even for public packages, which is friction on the first `npm install` —
the exact moment adoption is decided.

## Decision

### 1. Names: a scope for the libraries, the bare name for the CLI

- `@a11y-witness/evidence`
- `@a11y-witness/scorer`
- `@a11y-witness/judge`
- `@a11y-witness/nvda-worker`
- `@a11y-witness/worker-fleet`
- `a11y-witness` — **unscoped**, the CLI

The CLI takes the bare name so `npx a11y-witness https://example.com` works with no
scope to remember and no wrapper package. A `@a11y-witness/cli` that only
re-exports a bin would be a package whose name restates its code — the Clean Code
test for a useless extraction (2nd ed., §"Functions"), applied to a package.

Names describe the *artefact*, not a layer. `nvda-worker` rather than `worker`
because ADR 0001 deferred VoiceOver rather than ruling it out, and a future
`@a11y-witness/voiceover-worker` must be addable without renaming anything.
`evidence` rather than `core`, `types` or `contracts` because "evidence" is the word
this project already uses everywhere (`evidence:check`, "did the evidence move?",
"a check must never reject evidence whose absence is the finding") — the package
name should be the domain's word, and `core` is a name that means "everything we
have not thought about yet".

`scorer` and `judge` are distinct on purpose and the glossary pins the difference:
the **scorer** is the trained model that produces numbers, the **judge** is the
layer that turns numbers plus rules into WCAG findings. `local-judge.ts` already
draws that line (`scoreCapture` → `findingsFromScores`); the names now make it
visible from outside.

### 2. Registry: public npm

Public npmjs.com, scope `@a11y-witness`. Rejected alternatives:

- **GitHub Packages** — requires a registry-scoped auth token in `.npmrc` even for
  public reads. That is a hard stop at the adoption moment for a tool whose pitch
  is "drop this into your CI".
- **Local/file-based only** — cannot satisfy goal 2 at all; a consumer cannot pin
  what has no version in a registry.
- **A private registry** — premature; ADR 0003's hosted layer is Phase 4 and does
  not need one now.

Two operational requirements that are easy to forget and expensive to retrofit:
reserve the `@a11y-witness` scope **and** the unscoped `a11y-witness` name before
M2 publishes anything, and enable npm **provenance** (`--provenance` from a trusted
CI publish) so a consumer can verify a tarball came from this repo.

> **STATUS 2026-09-01, checked rather than assumed.** Provenance is now enabled in
> `release.yml` — `NPM_CONFIG_PROVENANCE` plus `id-token: write`, and by the env var
> rather than a flag because changesets runs `npm publish` itself with no argv to
> pass through. It was missing until it was looked for, which is what "easy to
> forget" means in practice.
>
> The names are **still unreserved** and all three are available: `a11y-witness`,
> `@a11y-witness/scorer` and `@a11y-witness/judge` all return 404 from the registry.
> Every package already carries its own `LICENSE`, so the split below is implemented
> rather than merely decided — verified across all six publishable packages.
>
> So what is left of this ADR is the reservation itself, which is an account action
> on a name this document has already chosen. Provenance is
worth more here than usual: the whole product claim is trustworthy evidence, and a
supply-chain story that stops at "trust us" undercuts it.

### 3. Licence: AGPL everywhere except `@a11y-witness/evidence`, which is Apache-2.0

`@a11y-witness/evidence` is Apache-2.0. Everything else — `scorer`, `judge`,
`nvda-worker`, `worker-fleet`, the CLI, and the repo itself — stays
AGPL-3.0-or-later. Each package carries its own `license` field and a copy of its
own `LICENSE` file in the tarball; a scoped package inheriting the root LICENSE by
proximity is not a licence grant.

The reasoning is that these two things want opposite licences:

- **`evidence` exists to be depended on by code we do not control.**
  `CaptureBackend` is an interface whose entire purpose (ADR 0003, decision 3) is
  that somebody else implements it — a JAWS backend, a VoiceOver backend, a
  consumer's CI glue that only needs `CaptureResult` to typecheck. AGPL on that
  package means anyone writing an alternative backend must AGPL their harness,
  which defeats the reason the interface was extracted. And there is nothing to
  protect: the package is types, a criterion list, and pure predicates over a JSON
  shape. Copying them buys an appropriator nothing, because the value is in the
  capture pipeline and the trained scorer, which stay AGPL.
- **The engine is the product.** `nvda-worker` is years of NVDA behaviour encoded
  as remedies; `scorer` is the trained model; `judge` is the tuned guard layer.
  AGPL there is what makes ADR 0003's Phase 4 open-core plan possible — a hosted
  competitor must publish their changes.

Apache-2.0 rather than MIT for `evidence` because it grants patent rights
explicitly and is AGPL-compatible in the direction we need (Apache code can be
combined into an AGPL work).

**This is a decision that cannot be taken back, and the author should sign it off
explicitly.** Narrowing `evidence` from Apache to AGPL later would be a rug-pull on
anyone who built on it; the copyright holder can technically relicense their own
code, but published versions stay published. If the answer is "AGPL everywhere",
the cost is accepting that third-party capture backends will not be written, and
the `CaptureBackend` interface becomes an internal seam rather than an ecosystem
one. Both are coherent; only one of them is what ADR 0003 said it wanted.

### 4. Manifest metadata that has to be right on the first publish

Per package: `description`, `repository` with a `directory` field (so npm links to
the package's subdirectory, not the repo root), `homepage`, `bugs`, `keywords`,
`engines.node` matching what we actually test (`>=22`), `"type": "module"`,
`"sideEffects": false` on the pure packages, `"files"` as an allow-list, and
`publishConfig.access: "public"` on every scoped package — a scoped package
defaults to *restricted*, and forgetting this is the classic first-publish failure.
`nvda-worker` adds `"os": ["win32"]`. `"license": "AGPL-3.0-or-later"` or
`"Apache-2.0"` as above, never the deprecated `SEE LICENSE IN` form.

Each package gets its own README whose first code block is a working install and a
working minimal invocation. That is not documentation politeness — the README is
where a consumer decides, and ADR 0007's isolation gate should be derived from it
so the README's example is the thing that gets tested.

## Consequences

- A consumer can `npm i @a11y-witness/judge` and read one licence that applies to
  it, rather than inferring from a repo root.
- An alternative screen-reader backend becomes legally writable by a third party,
  which is the ecosystem lever ADR 0003 assumed and never enabled.
- AGPL on the engine keeps the open-core route open; nothing in this ADR forecloses
  Phase 4.
- npm provenance ties every published tarball to a commit in this repo, which is
  the supply-chain analogue of the provenance we already stamp on captures.

## Residual risks and open questions

1. **Name availability is unverified.** Neither `a11y-witness` nor the
   `@a11y-witness` scope has been checked on npmjs.com. If the bare name is taken,
   the fallback is `@a11y-witness/cli` with `npx @a11y-witness/cli` — which works
   and is uglier. Check before M2.
2. **AGPL will still deter some adopters of the engine packages**, and no licence
   split fixes that. If adoption stalls specifically on the licence, the lever is a
   commercial exception for the engine, not relicensing.
3. **`@guidepup/guidepup` and Playwright licences** have not been reviewed for
   AGPL compatibility as distributed dependencies. They are permissive as far as we
   know, but "as far as we know" is not a licence review, and the first publish is
   when it matters.
4. Open: whether `worker-fleet`'s PowerShell provisioning scripts should be
   Apache-2.0 as well. They are operational glue a consumer must modify to run
   their own pool, which is an argument for permissive; they also encode hard-won
   NVDA repair knowledge, which is an argument against.
