---
"@a11ign/evidence": patch
"@a11ign/worker-fleet": patch
---

#453: `stripComments` (`@a11ign/evidence/source-text`) no longer corrupts a template literal whose
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
