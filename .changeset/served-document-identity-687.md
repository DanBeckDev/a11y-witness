---
"@a11ign/evidence": minor
"a11ign": minor
---

Every capture can now say WHICH document it was served, and two captures of one URL are no longer
indistinguishable (#687).

`environmentKey()` keys a capture on everything about the environment — browser, OS, architecture, NVDA,
guidepup, screen-reader settings, the provisioning revision, the protocol version — and, for corpus
pages, on the page directory. It recorded nothing about what the server actually sent. Measured on
`https://calendly.com/`, two captures eight minutes apart on one worker: one was served Google's sign-in
wall (the form probe activated "Continue with Google"), the other `calendly.com/scheduling`. Both records
say `url: "https://calendly.com/"`.

`documentIdentity()` derives that identity from marks the capture already carries — the served URL from
the census marks, the title from `titleSource` — so **every capture already on disk has one**, including
the two above. Nothing new is observed and no second copy is stored.

- **`evidence:check` and `gate:stability` refuse rather than compare.** A pair served different documents
  is a distinct outcome (`DIFFERENT_DOCUMENT`), never a list of field differences: those differences are
  all true and all irrelevant, and they send a reader after the capture pipeline when the cause was the
  page. `summarise` excludes such a pair from the sample and reports the run inconclusive.
- **The report says which render it describes.** WCAG Requirement 2's limitation has always read "one
  viewport, one state, one document" without ever saying which; it now names the served path, the title
  and the element counts.
- **The document identity is NOT a cache key,** and two tests now say so with the reason. Adding it would
  invalidate 2,122+ captures to guard a population that is empty: real-page captures never cache, and the
  corpus's pages are generated into a directory the key already covers.

The counts are reported and deliberately not compared: a real page recaptured an hour later has moved
links and is the same document, so deciding identity on counts would refuse most of the population this
runs against.

The served path is origin + path, because a sign-in URL carries per-request nonces and two captures of one
wall would otherwise differ every time. Each capture records HOW MANY query parameters were dropped —
the count, never the values — so a "same document" verdict says where it rests on origin and path alone.
`docs/known-gaps.md` §46 records what that costs: a site whose documents differ only by query string reads
as one document here.

One finding fell out of measuring the records rather than reasoning about them: the 10:42 capture carries
eleven `titleSource` marks, ten saying "Sign in - Google Accounts" and the last saying "Privacy Notice
Calendly". A capture whose own marks name two documents has no single identity, and the report now says
so rather than silently taking the first.
