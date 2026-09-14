---
"@a11ign/nvda-worker": patch
---

**An unnamed graphic in the tree census now says which element it is.** Each `graphicUnnamedDetail` entry carries the AX node's `backendDOMNodeId` (`null` on generated content) and an `element` read from Chromium's DOM domain, in the DOM census's own form, such as `img logo.png .brand`. So a 1.1.1 census referral names the node it came from (#1507).

The DOM census's `unnamedGraphics` selector is unchanged. Its comment now records the graphic shapes it does not select, and why it was not widened.
