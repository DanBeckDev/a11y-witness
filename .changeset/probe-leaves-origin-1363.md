---
"@a11ign/nvda-worker": minor
"@a11ign/evidence": minor
"a11ign": minor
---

**When a probe's activation takes the browser off the page's site, a11ign now ends the examination there.**
That includes a new window or tab, or a URL on another origin. Nothing observed after that point is reported
as the page's.

**What a report says about it.** The log line reads `examination ENDED -- left the site at "<control>"`
before the finding count. The summary leads with the same, and Conformance Requirement 2 names what was not
examined. The JSON result carries a new top-level `leftSite` naming the control, and where the browser went
when that is known.

**Controls inside an embedded frame or object are no longer activated.** On the page the docs recommend,
`https://www.w3.org/WAI`, the probe used to open the W3C's embedded YouTube player. Every sweep after it ran
on youtube.com, and its one serious finding was reported against w3.org.

**For the published types:** `@a11ign/evidence` exports `leftSite()` and `withinTheSite()`, and
`CaptureInteraction` gains an optional `leftSite`. A capture made before this is still recognised from its own
announcements ("Opening new window").
