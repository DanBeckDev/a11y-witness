---
"@a11ign/nvda-worker": patch
---

**A capture that did not probe navigation no longer records that navigation is opt-in.** When the navigation probe was off, `observed.routeChange.why` read "probeNavigation is opt-in", but navigation is ON by default in the CLI and the Action. It now reads that navigation is ON by default and this capture turned it off (`--no-probe-navigation`, or the Action's `probe-navigation: false`). `observed.routeChange.asked` is unchanged. The GitHub Action gains a `probe-navigation` input, default `true`, so a workflow can turn the probe off on a page it does not own (#1392).
