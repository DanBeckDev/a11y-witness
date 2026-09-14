---
"a11ign": minor
---

The Action's `fail-on` threshold now counts asserted findings only. A referred finding (one the judge marks as needing a
person's confirmation, outcome `cantTell`) is still listed in the summary and the log, but it no longer fails the run at
any threshold, however it is rated. Previously a referral rated `serious` failed `fail-on: serious` while the log line
called it referred. If you set a threshold, a run that failed only on referrals now passes. When a threshold is set, the
log says so in one line: "fail-on counts asserted findings; referrals are listed and never fail the run".
