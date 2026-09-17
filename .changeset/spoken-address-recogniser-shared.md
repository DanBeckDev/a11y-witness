---
"@a11ign/evidence": minor
"@a11ign/judge": patch
---

**`addressBarHost` is now exported from `@a11ign/evidence`, as its one definition.** It reads the scheme and host NVDA's browser address bar announces, e.g. `"Address and search bar, ... selected https: slash slash www dot youtube dot com slash channel ..."` -> `"https://www.youtube.com"`, or `null` for any other announcement.

- **Who imports it:** `leftSite()`'s own `spokenAddress()` helper, and the judge's 2.4.3 Tab-cycle check (`channel-comparison.ts`'s `fromDocumentEntry`, #1514), which used the address bar as the document-entry marker in a recorded Tab walk.
- **Who used to keep a copy:** `channel-comparison.ts` kept its own copy of the pattern, pinned equal to evidence's private one by a parity test (#1514, route B) — a worktree resolves `@a11ign/evidence` to a built `dist`, so proving a new export from the judge meant rebuilding shared state at the time. #1559 ends the copy now that the export exists.
- **The decision is unchanged:** the pattern and the scheme/host extraction are byte-identical to both the old private `SPOKEN_ADDRESS` match and the judge's former `SPOKEN_ADDRESS_BAR` copy.
