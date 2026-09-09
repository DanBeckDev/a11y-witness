---
"a11ign": patch
---

Fixed the GitHub Action's PR comment printing "**No blocking findings** Yes" directly above findings marked
serious when using the default local judge. The headline now states the count instead (e.g. "none; 6
finding(s) below that severity"), matching the CLI text report's own wording -- a bare yes/no is shown only
for backends (anthropic/openai) that actually answer a question about the task.
