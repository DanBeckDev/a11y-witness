---
"a11ign": patch
---

**`structureCensus.atMs` said the census was read at the END of the capture. It was read at the start —
and on 25 of 25 captures in one checkout's `runs/witness`, the field landed within 60 ms of the last mark
in its file.** The error is the whole capture: 93 s to 469 s, median ~310 s.

`createDiagnostics`' `mark` stamps `atMs` inside `entries.push`, so `atMs` is when the mark was PUSHED.
That is right for a phase mark, whose push *is* the event, and wrong for the three census marks: they are
read by `censusBeforeNavigating` at the top of `navigateByStructure` and pushed by
`navigateByStructureThenAudit` after every sweep and probe has run.

**Three marks, one read site, one defect.** `structureCensus` is the one that misled a reader;
`domCensus` and `mediaCensus` are read in the same call and pushed in the same place, and nobody had yet
asked them the question.

**What it cost.** Comparing `structureCensus.atMs` against the first sweep's mark to decide which side of
#699 five IKEA captures fell on produced *"#699 isn't in any of them"* — it is in three. That reading
closed #800 with the wrong mechanism (#850 corrects it) and blocks #844. **The field used to date the
instrument was the field the instrument misreports**, and it agreed with the reader until it didn't.

**The fix is a new field, not a corrected one.** `atMs` keeps meaning what it has always meant: correcting
it would make old and new records look alike while meaning different things, and no correction reaches a
capture already on disk. Each census mark now carries `readAt: { startedAtMs, tookMs }` — the start *and*
the duration, because a read is an interval and only the pair says how wide it is. Consumers gate on the
PRESENCE of `readAt`; `populationVerdict` (#850) is the consumer this unblocks.

**Nested, not flat, and that is load-bearing.** `censusElementCounts` and `censusFromDiagnostics` build
the element counts by taking every numeric field on the mark except `event` and `atMs` — a denylist. A
flat `readAtMs: 3200` would have arrived downstream as an element type named `readAtMs` with 3,200 of
them. A test in `packages/evidence` pins the other end of that agreement, so flattening it breaks where
the damage would be done.

**`createDiagnostics` had two copies and they were about to disagree.** It lived in `capture-core.mjs`
and `capture-setup.mjs`, duplicated deliberately to avoid an import edge that does not exist — both files
already import `capture-pure.mjs`. It lives there now, as one exported function, which is also what makes
it drivable by a test: the guard proves the fault is real by marking a value read 25 ms earlier and
asserting the two moments differ, rather than describing that in a comment.

**Not an evidence change.** Diagnostics are not evidence: no announcement, no `structure`, no
`interaction` moves. `CAPTURE_PROTOCOL_VERSION` is untouched and no cached capture is invalidated — older
records simply lack `readAt`, which is the state the consumer already handles.

Checked and not in scope: `markPageState` already marks immediately after its read and carries `tookMs`,
so its `atMs` is honest — it is the pattern this copies.
