# `@a11y-witness/judge`

Turns a screen-reader capture into WCAG 2.2 AA findings — the **judgment-based** failures a rule scanner
cannot see, because deciding them requires knowing what a blind user actually heard and whether they could
still finish the task.

It sits *alongside* axe-core, never instead of it. See `docs/adr/0002-layered-coverage.md`.

```bash
npm install @a11y-witness/judge @a11y-witness/scorer
```

```js
import { judge } from "@a11y-witness/judge";

const judgment = await judge({
  task: "Find the opening hours",
  transcript: capture.transcript,
  structure: capture.structure,
  interaction: capture.interaction,
});

// { taskCompletable: false, summary: "…", confidence: 0.82,
//   findings: [{ wcag: "4.1.2 Name, Role, Value", issue: "…", evidence: "…", severity: "serious", confidence: 0.9 }] }
```

## The default backend is our own trained scorer, not a rented LLM

`local` — a frozen MiniLM encoder with 27 KB of trained heads, from `@a11y-witness/scorer`. `codex`,
`anthropic` and `openai` exist for comparison and are never the default. This matters more than it sounds: the
backend defaulted to a hosted model for months while the GitHub Action shipped `local`, so the quality gate
measured a model that was not the one shipping. Flipping it surfaced two real defects immediately.

`@a11y-witness/scorer` is a **peer** dependency, deliberately. Its version is a semantic promise about
*scores*, so you must pin it yourself — and two copies at different versions in one tree would judge the same
capture differently.

## The deterministic layer works with no model at all

```js
import { ruleFindings } from "@a11y-witness/judge/rules";
import { oracleCounts } from "@a11y-witness/evidence/verify";

ruleFindings({ ...capture, ...oracleCounts(capture) });   // → Finding[]
```

**Use `oracleCounts`, and do not spell the extraction yourself.** A capture records both censuses as
DIAGNOSTICS, so passing the bare capture leaves every absence rule reading `undefined` and returning on its
first line — silently, because a rule with nothing to say and a rule that was never given its evidence
produce the same empty array. Four of this repo's six rule callers had that bug at some point, and each fix
reached the callers in front of whoever was looking. `rule-oracles.test.ts` discovers the callers now.

These are absence rules: an unnamed graphic, a control announced as a bare role, a heading that says nothing.
They need no scorer, no network and no Python.

**Absence rules corroborate against the accessibility tree, and that is not optional.** A sweep that returns
nothing looks identical whether the page has no headings or the screen reader was left in a mode where its
own navigation keys were being typed into the page — which happened here, on 353 captures. So `census` is the
oracle a rule about absence has to agree with, or it is guessing.

## Findings come back in the order a user meets them

```js
import { orderByLayer, layerOf } from "@a11y-witness/judge/layers";

layerOf("1.1.1");   // "perceive"
layerOf("2.4.4");   // "navigate"
layerOf("4.1.2");   // "interact"
```

Perceive, then navigate, then interact — a waterfall, because a finding about operating a control is not
useful to someone who could not perceive it in the first place.

## `./internal` carries no semver guarantee

`hasEvidenceFor`, `evidenceFor`, `findingsFromScores`, `scoreCapture`, `applyGate`. Exported so a test can
drive the *real* gate rather than a copy of it — this project already learned that lesson the expensive way,
when recovery keyed on a regex over an error message and the tests asserted on a string that lived in the test
file, so rewording the message broke production with every test green.

`docs/METHODOLOGY.md` records that these guards were tuned against the eval cases. A public promise on tuned
thresholds would freeze numbers we intend to move, so they are documented as unstable rather than quietly
stable.

## What it will not tell you

Anything visual. Contrast, focus-visible, reflow, target size — a screen reader cannot see them, so this
package never reports on them, and a report that omits them is not a clean bill of health. That is the whole
reason the layered architecture exists.
