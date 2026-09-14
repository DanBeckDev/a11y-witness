---
"a11ign": patch
---

**The Action's log line and job summary no longer present a referred finding as a failure of its severity.** On rehearsal 2's page, the one lived-experience finding was a referral: the judge maps it `secondary`, and the criterion's outcome is `cantTell`. The log still read "1 finding(s) (1 serious)", and nothing in the summary said it was a referral.

The log line now counts referrals apart from assertions, for example "1 finding(s) (1 referred)" or "3 finding(s) (2 asserted: 1 serious, 1 moderate; 1 referred)". Severities break down assertions only. In the summary's findings table each referral reads "referred" beside its severity, with a note saying what that means. A finding asserts only when the judge maps it `conformance`; absent or `secondary` refers, which is how the CLI's text report already tags each finding. `fail-on` is unchanged (#1366).
