---
"@a11ign/judge": patch
---

#811: fixed a bug where three or more genuinely distinct 2.4.7 focus-loss findings on the same control,
occurring close together in time, could silently collapse into one reported finding — the evidence text
for a repeated focusout carried no timestamp, so `ruleFindings`' own dedup treated identical-looking text
from different real moments as the same finding. The evidence for this finding now includes the event's
own timestamp, so a report undercounts less often. No change to any other finding's shape or count.
