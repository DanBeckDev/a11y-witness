---
"a11ign": patch
---

**When criteria rest on an examination known to be partial, the Action's log and job summary now count them.**
Before this, only the JSON result said so, in each such criterion's `outcomes[*].reason`. Rehearsal 2's result
carried eight of them, and its log read `a11ign: 1 finding(s) (1 serious)` with no word of any.

**What a report says about it.** The log adds `a11ign: N criteria rest on an examination known to be partial --
see the artifact` above its count of findings. The job summary's **Not determined** line counts those criteria
apart from the other referrals. A result where no sweep stopped short renders nothing new, and neither does a
result with no outcomes.

The JSON result is unchanged: the count is read from the `outcomes` it already carries (#1563).
