# Autonomous screen-reader dataset pipeline

This pipeline creates controlled good/bad page pairs, captures both through
the real NVDA worker, and exports JSONL whose model input contains only
screen-reader evidence. It does not ask a person to write labels or copy HTML
into the dataset.

The cases are small, deterministic instruments based on the accessibility
topics in the repository's bookctx references and existing evaluation
fixtures. A pair is exported only when the expected bad signal is observable
in the bad NVDA capture and absent from the good capture. This prevents a
known HTML mutation from being treated as evidence when NVDA did not actually
announce it.

The current matrix contains 45 pairs across image, link, heading, landmark,
form, control, dynamic-feedback, and table families.
Family metadata is preserved in the manifest and provenance so train/test
splits can keep near-duplicate mutations together.

## Run the pipeline

Generate the pages and manifest on the control machine:

~~~sh
npm run training:generate
~~~

Run the worker-free instrument and manifest audit:

~~~sh
npm run training:preflight
~~~

Serve the generated pages from the page directory:

~~~sh
npx serve runs/screenreader-dataset/pages -l 5050
~~~

In the interactive Windows session that owns NVDA, start the existing worker:

~~~powershell
$env:A11Y_PORT = "8765"
npm run worker
~~~

Then run the capture step from the control machine, with the worker reachable
over the network:

~~~sh
A11Y_WORKER=http://windows-host:8765 \
DATASET_BASE_URL=http://control-host:5050 \
npm run training:capture
~~~

On a Mac with the local UTM worker VM, set neither. The capture step starts the
VM on demand, works out the address the guest can use to reach this host, and
puts the VM back in the state it found it (see docs/local-worker-vm.md):

~~~sh
npx serve runs/screenreader-dataset/pages -l 5050
npm run training:capture
~~~

DATASET_BASE_URL still wins if you set it, but a `localhost` value is rewritten
to the host's address on the VM's subnet, because `localhost` inside the guest
is the guest.

A full run is ~90 NVDA captures over roughly an hour, so it publishes its state instead
of expecting you to watch a log:

~~~sh
npm run training:status
~~~

~~~
run:      started 2026-07-26T08:20:19.822Z
progress: 12/45 cases  (11 captured, 1 failed, 0 skipped)
worker:   http://192.168.64.4:8765
pages:    http://192.168.64.1:5050
current:  form-unlabelled-phone (bad), 0.4 min so far
last update: 0.4 min ago
worker now: capturing now
~~~

It reads `runs/screenreader-dataset/capture-progress.json`, which the run rewrites
atomically after every step, and separately asks the worker whether it is still
capturing -- so "finished", "working" and "wedged" are distinguishable rather than
inferred from silence. Exit codes: 0 healthy or finished clean, 1 finished with
failures, 2 no run recorded, 3 wedged (no update within one capture timeout plus
slack). A wedged or interrupted run does not have to start over:

~~~sh
npm run training:capture -- --resume
~~~

Resume skips a case only when the previous run recorded it captured *and* both of its
files are still on disk, since the progress file and the captures can be deleted
independently.

Two checks guard the data, both learned the hard way. Before capturing, the
pages must actually answer on the base URL; and each capture must mention a
significant word from the page's own `<title>` or it is rejected rather than
written. Without the second, a stray server holding port 5050 produced
`Capture complete: 3/3 cases` while every transcript read `Error code: 404` --
mislabelled training data that looks entirely plausible downstream.

The capture step is serialized because NVDA is a single shared resource. It
writes raw captures under runs/screenreader-dataset/captures/. A failed case
does not discard completed captures.

Finally export the model dataset:

~~~sh
npm run training:export
~~~

The JSONL output is
runs/screenreader-dataset/screenreader-evidence.jsonl. Each row has an input
made from screenReader, transcript, structure, interaction, and derived
evidence units. URL, task, HTML, DOM, CSS, axe findings, and diagnostics are
deliberately excluded from input. The provenance object is for auditing and
reproducibility, not model features.

The preflight report is runs/screenreader-dataset/preflight.json. A successful
preflight means the instruments are ready for NVDA; it does not count as a
captured training example.

Use npm run training:capture -- --only=filter-status to recapture a subset.
The generated run directory is ignored by Git; source cases and the pipeline
remain reviewable in this directory.

## What cannot run on this Mac

The generator and exporter run locally, but NVDA capture requires the
interactive Windows desktop documented in src/capture/nvda/README.md -- either
a remote worker or the local UTM VM (docs/local-worker-vm.md), which this Mac
can host. With neither available, the capture command stops instead of
fabricating transcripts. Once the worker is reachable, the complete collection and label
validation process is unattended.
