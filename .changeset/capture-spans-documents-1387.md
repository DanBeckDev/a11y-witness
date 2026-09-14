---
"a11ign": patch
---

**When a capture's evidence spans more than one document, the job summary, the Action's log and the CLI report now say so first.**
Before this, the only place that said it was Conformance Requirement 2 in the JSON result. For example, a probe
submits a search form and follows a link, and the capture's own title marks name two pages. The CLI report printed
that sentence only in its last section, and the job summary did not print it at all.

**What a report says about it.** The summary leads with Requirement 2's own sentence, above its heading:
"THIS CAPTURE NAMED MORE THAN ONE DOCUMENT and so has no single identity — …", naming each document. The Action's
first log line says the capture spanned more than one document. The CLI report states it under the URL and Task
lines. A capture that named one document renders nothing new, and neither does a result with no conformance.

The JSON result is unchanged: the sentence is read from the `conformance` it already carries (#1387).
