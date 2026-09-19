---
"@a11ign/nvda-worker": patch
---

A worker whose desktop foreground is held by a notification toast, Windows search, or the Start menu (so a
launching Edge could never take focus) no longer sits wedged indefinitely: `prepareDesktop` now clears the
holder before a capture, the same way it already clears a blocking dialog, instead of only recording that
it found one (#1733). A foreground holder it cannot clear still degrades to "did nothing" and the capture
proceeds regardless — the same rule the dialog path already followed.
