---
"@a11ign/nvda-worker": patch
---

`waitForSpeechQuiet` no longer treats a FAILED read of the speech log the same as a genuinely empty one.
Previously, `.catch(() => [])` folded a query failure (a timeout or a dead speech channel) into the same
length it used for a real quiet read — so a channel that stopped answering could report `quiet: true`
after one settle window, indistinguishable from NVDA genuinely finishing speaking. This is a bug fix on
the FAILURE path only: a normal capture, where every read succeeds, behaves byte-identically, so no
cached evidence is affected. Only a capture that hit a genuine speech-channel read failure during a
settle wait could have been mis-timed before this fix.
