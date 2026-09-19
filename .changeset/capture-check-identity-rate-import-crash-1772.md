---
"@a11ign/nvda-worker": patch
---

**Importing `@a11ign/nvda-worker` no longer crashes on a host with no screen reader (#1772).** `capture-setup.mjs` and `capture-probes.mjs` used to `import … from "@guidepup/guidepup"` at the top of the file; that package constructs a module-level `ScreenReader` singleton at import time and throws `No available supported screen readers` unless it resolves macOS VoiceOver or Windows NVDA — so merely importing this package by name crashed `capture:check`/`identity:rate` at import even in `--worker` HTTP mode, which never drives NVDA locally at all. Both files now reach `@guidepup/guidepup` through a dynamic `await import()` inside the function that actually drives NVDA, so the crash stays at first real use rather than at import.
