---
"@a11ign/worker-fleet": minor
---

The local-VM scripts (`worker-ctl.sh`, `fetch-windows-iso.sh`, `build-vm.sh`, `clone-worker.sh`,
`create-utm-vm.sh`) now refuse to run (exit 1) unless `A11Y_LOCAL_VM=1` is set in the environment, instead
of printing a deprecation warning and continuing. Capture on the bare-metal fleet (`npm run fleet:status`,
`npm run fleet:deploy`) instead; set `A11Y_LOCAL_VM=1` to keep using a local UTM VM.
