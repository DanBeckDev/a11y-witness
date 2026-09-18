# `scripts/history-purge-replacements.txt` — why it holds rules and nothing else

**THIS DOCUMENT EXISTS BECAUSE ITS CONTENT USED TO LIVE IN THE FILE, AND DESTROYED THE REPOSITORY.**

`git filter-repo --replace-text` has **no comment syntax**. Every non-empty line is a replacement rule:
a line containing `==>` replaces the left side with the right, and **a line without `==>` replaces that
literal text with `git filter-repo`'s default, `***REMOVED***`.**

The file used to open with twelve lines of explanation, each beginning with `#`, two of which were a bare
`#`. On 2026-09-18 that rewrite was run against the real history and force-pushed: **every `#` character
in every file across 6,108 commits became `***REMOVED***`.** `#!/bin/sh` became `***REMOVED***!/bin/sh`,
so the repository's own git hooks stopped being valid shell, which is how it was noticed — a `git
checkout` died on `scripts/git-hooks/reference-transaction`. Restored from the pre-rewrite clone the
runbook requires keeping; that instruction is the only reason it was recoverable.

So the file is rules only, `parseReplacementRules` refuses any line without `==>` before the rewrite runs,
and the prose lives here where it cannot be executed.

## The rule the file carries today

```
regex:\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b==>REDACTED-INTERNAL-ADDRESS
```

**One pattern: RFC 1918 private addresses** — the measured defect, 2,268 matches across 715 (blob, path)
pairs on the pre-purge history, verified by `scripts/history-secret-scan.mjs`. Add a further
`regex:PATTERN==>REPLACEMENT` line here, never a second file: one file the invocation reads is one file
that can go stale, and a second would be the fact-stated-twice shape this project keeps finding in its own
tooling.

**The replacement is TEXT, deliberately not another IP-shaped string.** Substituting one address for
another (even an RFC 5737 documentation address) would still match this same pattern, so the scan used to
verify the purge worked could never read zero — it would just be checking its own placeholder.

## Why the secret scan could not catch the damage

`history-secret-scan.mjs` looks for **secret patterns**. A rewrite that mangles every `#` still scores
zero findings, because `#` is not a secret. `CLEAN: 0 findings` meant "the target pattern is gone", never
"nothing else changed" — and it was read as the latter.

`verifyRewrite` is the answer: it compares the rewritten tip tree against the source tip tree and requires
every changed file to be **exactly** what applying the declared rules to the original produces. A rewrite
that touches a file the rules do not explain is refused, named, and never pushed. Under the defect above
it refuses on the first file it reads.
