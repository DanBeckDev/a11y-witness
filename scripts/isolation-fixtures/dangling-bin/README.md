`bin` points at `./dist/cli.mjs`, and there is no `dist/`.

**The first version of this fixture tried to lose the bin by leaving it out of `"files"`, and could not:
`npm pack --dry-run --json` shipped it anyway.** npm force-includes a `bin` target regardless of the
allow-list, the same way it always ships `package.json`, the README and the `main` entry — so the
files-array defect that `truncated-files` exercises for a library file CANNOT happen to a bin.

That narrows the real class to a bin whose target is not in the package at all: a rename the manifest did
not follow, a typo, or — the one this repo is actually exposed to — a path into `dist/`, which is
gitignored build output. Four of this repo's nine declared bins point into `dist/`, so a pack whose build
did not run produces exactly this fixture, for every one of them at once.
