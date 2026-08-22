# `a11y-witness`

Drives a **real screen reader** through a real page and reports the WCAG 2.2 AA failures a rule scanner cannot
see — the ones that need to know what a blind user actually heard, and whether they could still finish the task.

**Alongside axe, never instead of it.** Both layers run; neither subsumes the other.

```bash
npx a11y-witness https://example.com --task "Find the opening hours"
```

> **Not published yet.** `npx a11y-witness` returns E404 today — no package has been pushed to npm, and the
> name is still undecided (PLAN.md, B5). Until it is, the working paths are the **GitHub Action**
> (`uses: DanBeckDev/a11y-witness@main`, no install and no Windows machine of your own) or a clone of the
> repo. The command above is what the CLI *is*, and it works from a checkout; it is written here as the
> package's front page because that is where it will be true. Tracked as PLAN.md B7.

## What "a rule scanner cannot see" means, concretely

Measured against the University of Washington "Accessible University" demo — a third-party, expert-built
inaccessible page and its accessible twin:

| | before (inaccessible) | after (accessible) |
|---|---|---|
| screen-reader layer | 1.1.1, 1.1.1, 4.1.2, **2.4.4**, **1.3.1** | none |
| axe | 1.4.3, 3.1.1, 1.1.1, 4.1.2, 1.4.1, 2.5.8 | none |

Two findings only the screen-reader layer produced, quoting what a user hears:

```
2.4.4 Link Purpose          heard: "click here, link"
1.3.1 Info & Relationships  heard: "102 announcements, no heading among them"
```

axe reports neither, and not by oversight: its `link-name` rule asks whether a link *has* an accessible name,
and "click here" has one. Meanwhile axe found four things a screen reader cannot perceive at all — contrast,
target size, language. That is the argument for running both, and the accessible twin being clean on both
matters more than either list.

## It will not tell you about anything visual

Contrast, focus-visible, reflow, target size: a screen reader cannot see them. Every report **says so** when
the rule layer did not run, because "we checked and found nothing" and "we did not check" must never look
alike. Reporting silence as a clean bill of health is the single most misleading thing this tool could do.

```bash
npx a11y-witness <url> --no-axe                    # screen-reader layer only, and the report says so
npx a11y-witness <url> --axe-results axe.json      # import a run you already did
npx a11y-witness <url> --json                      # machine-readable, for CI
```

## You need a Windows worker

The capture runs on Windows, with NVDA, in an interactive desktop session — that is not a limitation to work
around, it is what makes the evidence real. Point the CLI at one:

```bash
A11Y_WORKER=http://192.168.64.4:8765 npx a11y-witness <url> --task "..."
```

On macOS with UTM, `@a11y-witness/worker-fleet` will lease a local VM for the run and put it back as it found
it. See `@a11y-witness/nvda-worker` for the worker itself.

## A page behind a consent wall is REFUSED, not reported

The screen reader gets held inside the modal, so the capture describes the dialog rather than the page. The run
exits 2 and says which it was. This is deliberate and it is the check that matters most in the whole tool:
on one real site the census found 793 links and 463 headings while the screen reader reached 1 heading and 0
links, and an earlier version reported "No lived-experience findings" — for a page it had never seen.

## Rendering the report yourself

```js
import { reportLines } from "a11y-witness";

console.log(reportLines(report).join("\n"));
```

`reportLines` and the `Report` type are the entire public API. Findings come back in the order a user meets
them — perceive, then navigate, then interact — because a finding about operating a control is not useful to
someone who could not perceive it.

The pieces underneath are packages in their own right: `@a11y-witness/judge` for the judgment,
`@a11y-witness/evidence` for the capture contract, `@a11y-witness/worker-fleet` for the VM lifecycle.
