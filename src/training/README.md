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
interactive Windows desktop documented in src/capture/nvda/README.md. If
A11Y_WORKER is absent, the capture command stops instead of fabricating
transcripts. Once the worker is reachable, the complete collection and label
validation process is unattended.
