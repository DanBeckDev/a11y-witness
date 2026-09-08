---
"a11ign": patch
---

Fixed #493: when a run failed before producing any report at all, the Action's PR-comment step used to
print "Could not post the PR comment. The job summary still has the report" — false, since nothing was
ever produced. It now says so honestly, naming the real cause, and keeps the original message for the
case it was actually written for (a report exists, but posting the comment itself failed).
