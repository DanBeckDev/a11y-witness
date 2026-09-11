# Captures no declared page claims

`rules:real-pages` scores every capture under `runs/real-page-corpus` that a `REAL_PAGES` entry claims.
Captures that no entry claims are **invisible**: not scored, not reported, and — until the freshness line
was fixed — counted into the "captures this scored" spread, where they made a 46-minute population read as
**304 hours** and made a clean refresh of every declared page appear to make things *worse*.

Measured on the authoritative corpus, 2026-09-07: **24 orphans** against 99 declared pages.

```bash
npm run lab:job -- -e job=prune-orphan-captures                  # report; deletes nothing
npm run lab:job -- -e job=prune-orphan-captures -e apply=true    # delete the RETIRED ones only
npm run corpus:prune-orphans                                     # against a local copy; it is only as
                                                                 # fresh as your last sync
```

**Run it on the lab.** A laptop's `runs/` is as fresh as its last sync, so a local report names a set that
may not exist on the machine that holds the corpus.

## Two causes, and only one is safe to delete

| verdict | what it is | deletable |
|---|---|---|
| **RETIRED** | the publisher moved the page, the declaration followed, the old capture stayed | **yes** |
| **RELOCATED** | the capture IS of a declared page, reached at a different **origin** | **never** |
| **UNCLASSIFIED** | no usable url in the capture — a damaged capture, which is a different question | never |

`historicenvironment.scot/visit-a-place/places/edinburgh-castle/` sits beside the declared
`/visit/all/edinburgh-castle/`: same site, same page, an address the publisher has changed. Nothing reads
it. That is RETIRED.

**A fixture page reached at another origin is RELOCATED**, and it must never be deleted. Fixtures are
declared `http://localhost:5050/…` and captured `http://192.0.2.10:5050/…`, because a fleet worker cannot
reach `localhost` — that resolves to *itself*, not the host serving pages. Five of the ten are the only
real-page grounding **2.4.1, 2.4.2, 2.4.3, 2.1.1 and 1.4.13** have, so deleting one would turn a matching
bug into a data-loss bug and take those criteria's grounding with it.

**Since #881, `realPageFor` reconciles the ordinary case**: a fixture captured at an IPv4 address, on its
declared port and path, resolves to its declaration and is scored. So the ten are no longer orphans, and
this tool no longer sees them. RELOCATED is what remains for a page-server capture the matcher does not
undo — a named host, another port — and `rules:real-pages` prints those under their own heading rather
than as undeclared. Until #881 they read as undeclared, and #881's first version asked for them to be
deleted on that basis.

RELOCATED wins over RETIRED wherever both could apply, and `corpus-prune-orphans.test.ts` asserts that
asymmetry by name. It is not decoration: it is the difference between tidying and destroying.

**A fixture is decided by its declaration's `role`, never by its host alone (#940).** The host is
`FIXTURE_BASE`, which `DATASET_BASE_URL` overrides. Until #940, setting that documented variable to any
non-loopback address made every fixture capture RETIRED, and `--apply` deleted all ten. `isFixture` is the one
predicate the prune tool, the matcher and `rules:real-pages` share, so they cannot disagree about which
captures are fixtures.

## It reports by default, and that is not decorum

`runs/` is gitignored and these captures are hours of worker time that **cannot be recreated** —
`browserVersion` is a capture cache key precisely because Edge announces differently across releases, so
evidence taken under Edge 151 cannot be re-made now 152 ships. There is no undo. `corpus:snapshot` and
`lab:reset` take the same shape for the same reason.

## Afterwards, prove nothing went quiet

**Re-run `rules:real-pages` and compare the findings either side.** They must be identical. A page silently
leaving the corpus is how a gate goes quiet, and quieter is only good if it has not gone deaf — the lesson
`rules:gate` exists to enforce.

See #143 (the orphans), #146 (the fixture-origin mismatch that creates the RELOCATED ones) and #881 (the
matcher that reconciles it).
