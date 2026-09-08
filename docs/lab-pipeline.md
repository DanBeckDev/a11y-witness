# Lab Pipeline

This is the capture/lab pipeline reference moved from CLAUDE.md during #458 — the ordered stages behind
`npm run lab:pipeline`. **Not** to be confused with `docs/pipeline.md`, which is the merge/CI pipeline.

## Producing evidence is a PIPELINE, and it is one command

`npm run lab:pipeline -- --pipeline=<name>` runs the ordered stages that used to be typed out by hand.
`--list` names them; `gates` needs no worker and so leaves the fleet alone.

```bash
npm run lab:pipeline -- --list
npm run lab:pipeline -- --pipeline=real-pages          # deploy -> capture -> rules:real-pages -> rules:coverage
npm run lab:pipeline -- --pipeline=corpus --ref=<branch>
npm run lab:pipeline -- --pipeline=gates               # no fleet: reads the corpus already on disk
npm run lab:pipeline -- --pipeline=verify --only=route-title-stale+  # PROVE a corpus change first
npm run lab:pipeline -- --pipeline=full                # corpus + model + gates, proven TOGETHER
npm run lab:job -- -e job=everything                  # the same chain as ONE supervised unit
                                                      # (it runs `lab:everything` on the lab)
```

Every stage already existed and was supervised. What did not exist was the ORDER, which lived in
somebody's head — the same defect `lab:retrain` closed one layer down. Retyped by hand on 2026-08-25 that
sequence produced: a fleet deployed at `main` while the lab ran a branch, four boxes rebooted for a ref
nobody had pushed, an `ANSIBLE_EXIT=2` masked by `| tail`, and three jobs run four commits behind.

- **Prove a corpus change on ONE subtype before paying for the whole corpus.** A full recapture is ~4 h,
  and a corpus change usually targets one subtype's evidence — so running four hours to discover the fix
  did not move the number is the wrong order. `verify` captures just the cases named by `--only=` and then
  runs the audits that would SEE the change; if they still report the same finding, the fix is wrong and
  it cost minutes. The capability existed the whole time (`capture-screenreader-dataset.mjs` has taken
  `--only=` with exact ids and lists for months) and **no job exposed it**, so the only unit available was
  all-or-nothing. Paste what `check-signals` or an audit printed. **A trailing `+` means the FAMILY** — the base case and its `+also-`/`+with-` variants — because an exact id deliberately means exactly that case: `form-error-silent` is a real id AND a prefix of ~90 others. Asking for `route-title-stale` and getting 1 of 7 is a confident partial answer, which is worse than none.
- **ONE ref, resolved once and given to both halves.** `fleet:deploy` takes `a11y_git_ref`, `lab:job` takes
  `ref`, and they default independently — which is exactly how the fleet came to be on a different commit
  from the lab, failing with a hash mismatch that reads like a corrupted guest checkout. It is also
  **refused before anything expensive runs** if it is not on origin, because both halves fetch from there.
- **It stops at the first failing stage** and names what did not run, for the reason `lab:retrain` gives: a
  pipeline that continues past a failed gate produces a number that looks exactly like a good one.
- **It is a node script and not one Ansible playbook, and that was MEASURED.** The two halves are in
  different credential domains: the workers are reachable only from the control plane, and the lab needs the
  `a11y-pve` key, which the control plane does not have — verified 2026-08-25, the lab's SSH port is open
  from there and answers `Permission denied (publickey)`. Exactly one machine can drive both. Giving the
  control plane the lab key would make a single playbook possible and would put both halves of ADR 0012's
  split behind one credential.
- **Stages go through the npm scripts**, never a second spelling of `ansible-playbook` — `lab:job` also sets
  `ANSIBLE_CONFIG`, without which the collections path and host-key settings differ.

**`lab:everything` and `--pipeline=full` were TWO SPELLINGS OF THE WHOLE CHAIN, and they disagreed.**
`full` names thirteen jobs; the npm chain named six, and nothing compared them. So `shortcuts`,
`acceptance` and `applicability-audit` were simply absent — and `acceptance` is what writes the report
`promote:model` requires, so a complete run ended at *"model-candidate is not releasable: held-out
acceptance has not been run against these weights"* with `rules:gate` (1,183 conformant records, 0 false
positives), `rules:coverage` and `rules:real-pages` all green behind it. Those three stages existed ONLY
as Ansible job argv and had no npm script at all, so the chain could not have run them.
`everything-chain.test.ts` now requires every job in `full` to be a stage here or to be **covered by**
one — and VERIFIES each claimed containment, because an unverified containment list is "trust me" written
in test form. Mutation-checked by deleting the `acceptance` stage, which reproduces the failure exactly.

**`lab:everything` names the stage it is on, and the one it stopped at.** It was six npm scripts joined
with `&&`, which ran correctly as one unit and said nothing about where it had got to — so when it died at
exit 3 on `REFUSING to overwrite ... a RELEASE-ELIGIBLE model`, locating the stage cost two dispatches and
a `lab:fetch` of the whole journal. It is now the step runner `retrain-pipeline.mjs` already had, over a
longer chain: a banner and a `why` per stage, stderr captured on failure, `STOPPED at <stage>`, and the
stage list printed on SUCCESS too — "it passed" and "it passed these six things" are different claims and
only the second survives being read a week later. `everything-chain.test.ts` pins the order and that every
stage names a script that exists, because `npm` would otherwise fail with *Missing script* hours in.

**For a long unattended run, prefer `lab:job -e job=everything` over `--pipeline=full`.** They sequence
the same stages; the difference is where the SEQUENCING lives. `lab:pipeline` runs on a laptop, so each
stage is a supervised systemd unit and the thing deciding what comes next is a local node process —
measured 2026-08-26, five local watchers were killed during one capture, and each time the unit survived
exactly as designed while the orchestration did not, so nothing after it ever started. As a job the whole
chain is one unit: it outlives the ssh connection, the playbook and the laptop, and `lab:status -e
job=everything` still finds it. `lab:pipeline` stays right for a SHORT chain you want to watch, because it
prints per-stage boundaries live and a single unit cannot.

> **BUT DEPLOY THE FLEET FIRST — the job cannot do it for you.** Every capture-bearing `lab:pipeline`
> entry carries `fleet: true` and ships the ref to the workers before dispatching. `lab:job -e
> job=everything` cannot: only the control plane holds both credentials (ADR 0012), so the lab has no
> route to deploy the boxes it is about to capture on. Choosing the job route therefore means running
> `npm run fleet:deploy -- --ref=<ref>` yourself.
>
> Measured 2026-08-27: a worker file changed, `everything` was dispatched without deploying, and it died
> 30 seconds in with `5 stale worker(s)`. That is `assertFleetRunsThisCheckout` working exactly as built —
> the message even names `fleet:deploy` — and the cost was one dispatch rather than a corpus captured on
> the wrong code. The gap is not in the guard, it is that the RECOMMENDATION above omitted a prerequisite
> the alternative route performs silently.

`lab-pipeline.test.ts` pins the pipelines against the real catalogue: every job named must exist in
`lab-job.yml`, and a pipeline containing a job that reads `A11Y_WORKER(S)` must deploy the fleet first. A
renamed job would otherwise fail at its STAGE, which for `corpus` is after a multi-hour capture.

### A capture now REFUSES a fleet that is not running this checkout

`run-job.yml` refuses to run at a commit other than the one asked for — *"a job that quietly runs four
commits behind reports success for code you did not ask for."* That guard covers the LAB and says nothing
about the twelve machines that take the captures, which are a second checkout deployed by a separate
command nobody was forced to run.

Measured: after `MAX_TAB_STOPS` went 12 → 150 and `collectByType` began recording `prevCount`, the
real-page corpus held **both populations at once**, and reading it meant bucketing captures by whether they
carried the new diagnostic mark at all. Every gate was green. `npm run worker:code` has answered this
correctly the whole time and is a separate command a human must remember — this file's own definition of a
check that does not happen. It was remembered by hand four times in one day.

`assertFleetRunsThisCheckout` (`worker-code-check.mjs`) now runs at the boundary of **both** capture entry
points, and `--allow-stale-workers` says so in the output rather than passing quietly.

- **Both, not one.** The remedy reaching one of several paths is this repo's most expensive recurring shape
  (`anchorToTop`, `ensureSpeechChannel`, `waitForAnnouncement`). `worker-code-check.test.ts` DISCOVERS every
  lab module that POSTs to `/capture` and requires each to be classified as a corpus writer (must check) or
  a diagnostic (must not — a diagnostic may never take the pool offline). A seventh capture client fails
  that test until somebody decides which it is.
- **The synthetic corpus is the worse half.** Real-page captures never cache, so a stale worker's evidence
  there is at least overwritten next run. Dataset captures ARE cached, and `workerCode` is deliberately
  outside the cache key — so one stale guest's capture is reused for ever with nothing recording which code
  produced it.
- **A hash mismatch does not say which side moved**, and the two need opposite responses. If the local
  worker source is dirty against HEAD the CHECKOUT is the odd one out and deploying would ship uncommitted
  work — an uncommitted `CAPTURE_PROTOCOL_VERSION` bump among it invalidates every cached capture. The
  refusal detects that and inverts its own advice.
- **It is a precondition and never a key.** Nothing here invalidates a cached capture, and `workerCode`
  stays out of both the cache key and `fleet-consistency.mjs`'s `MUST_MATCH` — those answer *is this
  evidence still valid* and *are these guests interchangeable*. This answers a third question, and a
  comment-only false alarm costs one `fleet:deploy` while a real drift costs a corpus.

Proved by making it fire against the real fleet, not by a green unit test: a whitespace change to one
worker file took it from `Fleet runs this checkout (worker code bccf65cf76d4baef, 4 worker(s) checked)` to
a refusal naming both hashes and exit 3. **A guard must be shown to fail before it is trusted** — both
capture-client guards were mutation-checked the same way.

### `lab:job` checks the fleet BEFORE dispatching, for the jobs that would actually need it

The check above runs on the LAB, inside the job's own script — so `npm run lab:job -- -e job=capture` still
dispatches over the lab's own SSH key, the lab starts the job, and only THEN does it refuse `10 stale
worker(s)`. Correct, and one round trip too late: worker files merged, a capture dispatched, a wait, a
refusal — twice in one day. `lab:pipeline` avoids this because `fleet: true` ships the ref to the workers
before dispatching; `lab:job` cannot do that itself, because only the control plane holds both credentials
(ADR 0012), so the job route depended on a human remembering to `fleet:deploy` first.

`packages/control/src/lab-job.mjs` now wraps the `ansible-playbook` call: for a job whose `setenv` sets
`A11Y_WORKERS` from `lab_fleet_workers` — `capture`, `capture-only`, `capture-real-pages`,
`capture-acceptance`, `capture-acceptance-2`, `retrain`, `everything` — it asks every worker's `/health`
over HTTP first, no SSH and no control-plane key needed, so it runs from wherever the operator already is.
`--allow-stale-workers` is the same escape hatch and says so the same way.

- **DERIVED, not hand-written.** `captureBearingJobs` reads `lab-job.yml`'s own text rather than naming the
  jobs, for the same reason `worker-code-check.test.ts`'s `CORPUS_WRITERS` list exists: a forgotten job is
  the one that slips through. `packages/control` cannot depend on the real YAML parser (ADR 0012), so it
  slices the catalogue by the indentation the file already commits to and is mutation-checked against a
  renamed or re-indented catalogue rather than trusted on the strength of reading it.
- **Deliberately narrower than "every job that touches a worker".** `stability`, `gate-stability` and
  `evidence-check` are excluded — they are diagnostics, one named worker or a comparison that never
  persists, and `worker-code-check.test.ts`'s own rule applies: "a diagnostic must NEVER be the thing that
  takes the pool offline". A stale worker there costs one wrong verdict; a stale worker on a corpus writer
  costs 2,122 captures indistinguishable from current ones for ever.
- **`assertFleetRunsThisCheckout`'s comparison moved to `code-drift.mjs`**, which imports nothing but
  `node:child_process`. `expectedWorkerCode` still needs a SUBPATH import to avoid the TS5055 build error
  this file already records above it — and a subpath resolves through `node_modules`, which `lab-job.mjs`
  cannot have. So the pure half — compare, describe, decide — lives where both callers can reach it, and
  each computes the hash itself, the same way `fleet-playbook.mjs` already does.

