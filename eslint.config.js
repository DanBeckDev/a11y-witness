// ESLint flat config — the MECHANICAL half of our code conventions.
//
// These rules enforce the objective, regression-prone parts of the patterns in
// Clean Code (Martin): small functions that do one thing, few arguments, shallow
// nesting, and no swallowed errors. The JUDGMENT half (does it really do one
// thing? is a comment noise or intent? don't force Java-OO structure) lives in
// CLAUDE.md, because no linter can decide it.
//
// Errors block CI. Warnings are surfaced but non-blocking, reserved for rules
// that are valuable but too noisy to gate on (magic numbers, naming).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { builtinRules } from "eslint/use-at-your-own-risk";
// #1155: the rule lives in its own module rather than inline -- this config already carries two rules and
// their headers, and the third's reasoning is longer than the rule. Imported by RELATIVE path for the
// reason `isolation-gate.mjs` states: a package specifier here dies before any install has run.
import { derivedLocalRule } from "./scripts/uncontrolled-emptiness.mjs";
import { gitSpawnScrubbed } from "./scripts/git-spawn-scrubbed.mjs";

// ESLint's OWN `max-lines-per-function`, registered a second time under a local name so it can run with
// different options beside the first (#908). A rule takes one set of options per name, and the two budgets
// below measure different things. Nothing here counts lines itself, so there is no second copy of the
// counting to drift. `use-at-your-own-risk` is ESLint's documented door to its core rules, and if a future
// ESLint closes it, config loading fails here by name rather than the rule quietly disappearing.
const maxLinesPerFunction = builtinRules.get("max-lines-per-function");
if (!maxLinesPerFunction) throw new Error("eslint no longer exports max-lines-per-function via use-at-your-own-risk");
/**
 * #1144: A READ OF `statusCheckRollup` MUST NARROW IT TO THE NEWEST RUN PER NAME.
 *
 * The rollup UNIONS superseded runs, so a raw filter answers about every attempt ever made -- a
 * superseded FAILED run survives on the head for ever and reports a green PR as failing, which is what
 * `merge-queue.mjs` did until #634.
 *
 * THIS IS AN AST RULE BECAUSE THE GUARD IT REPLACES WAS A LINE REGEX, AND THAT IS THE POINT RATHER THAN
 * A PORTING DETAIL. `bounded-window-reads.test.ts` asked whether the LINE mentioned a window-naming
 * predicate, so a raw read passed whenever its line mentioned a wrapper for any reason -- an unrelated
 * call, an import. That is the guard's own recorded defect one granularity down: its header says the
 * first version asked whether the FILE mentioned one and `npm run mutate` reported THE GUARD DID NOT
 * BITE, *"a check observing something ADJACENT to the property, where the adjacency holds while the
 * property fails."* Per-line fixed the file case and kept the shape.
 *
 * This asks whether THIS read is wrapped, which is the property itself. It also sees a read split across
 * lines, which a line regex cannot. Both holes were latent rather than live -- all 21 rollup reads in the
 * tree passed the old predicate correctly -- and that is stated on #1144 rather than claimed otherwise.
 *
 * EXEMPT BY OPTION, not by a table in a test: `wideWindowIsHarmless` is the rule's own fixture per #908
 * clause 3. It is EMPTY today, and THE MEASUREMENT IS THE LINT RUN ITSELF -- an unwrapped read anywhere in
 * the tree is an error, so "the option is empty and lint is green" is a continuously re-proved statement
 * rather than a count that goes stale. (It said "all four readers narrow" until #1152; the number was
 * ambiguous between the wrappers and the call sites, and it was already wrong for one of the two readings.)
 * The option exists so a reader that genuinely does not need the newest answer is CLASSIFIED rather than
 * made to adopt a predicate it has no use for. "Nothing needs this" and "somebody forgot" must not be the
 * same state.
 *
 * A NAME ON THIS LIST IS A CLAIM ABOUT BEHAVIOUR, so each one is proved where it can be. `newestPerName`
 * and `newestConclusionOf` are driven in `bounded-window-reads.test.ts`; `newestRun` and
 * `newestRunCompletedAt` (#1152) in `update-branch-decision.test.ts`, which is where they can be driven
 * at all -- importing `update-branch-sweep.mjs` into the guard file would give it a `token` requirement
 * through its closure (`deriveClosureRequirements` -> token via update-branch-sweep.mjs -> gh) and
 * disqualify it from the job that runs acceptance commands. Without a proof SOMEWHERE, extending this list
 * is how a reader that does NOT narrow gets admitted by being called the right thing.
 */
const NARROWS_THE_WINDOW = new Set(["newestPerName", "newestConclusion", "newestConclusionOf",
  "newestRun", "newestRunCompletedAt", "headQuietSeconds"]);

/** @type {import("eslint").Rule.RuleModule} */
const boundedWindowReads = {
  meta: {
    type: "problem",
    schema: [{ type: "object", properties: { wideWindowIsHarmless: { type: "array", items: { type: "string" } } },
      additionalProperties: false }],
    messages: {
      raw: "this reads `statusCheckRollup` without narrowing it to the newest run per NAME. The rollup "
        + "unions superseded runs, so a raw read answers about every attempt ever made and reports a "
        + "green PR as failing -- `merge-queue.mjs` did until #634. Wrap it in one of: {{wrappers}}. If "
        + "the wider window genuinely cannot mislead here, add this file to the rule's "
        + "`wideWindowIsHarmless` option with the reason.",
    },
  },
  create(context) {
    const exempt = new Set(context.options?.[0]?.wideWindowIsHarmless ?? []);
    if (exempt.has(context.filename.replace(`${process.cwd()}/`, ""))) return {};
    return {
      // THE READ ITSELF, not its line: `<anything>.statusCheckRollup`. Reported unless an ANCESTOR call
      // is one of the narrowing wrappers -- walking up rather than matching text is what makes this
      // about the read rather than about a neighbour of it.
      "MemberExpression[property.name='statusCheckRollup']"(node) {
        for (let n = node.parent; n; n = n.parent) {
          if (n.type === "CallExpression") {
            const callee = n.callee.type === "MemberExpression" ? n.callee.property : n.callee;
            if (callee?.type === "Identifier" && NARROWS_THE_WINDOW.has(callee.name)) return;
          }
        }
        context.report({ node, messageId: "raw",
          data: { wrappers: [...NARROWS_THE_WINDOW].join(", ") } });
      },
    };
  },
};

const local = { rules: {
  "max-physical-lines-per-function": maxLinesPerFunction,
  "bounded-window-reads": boundedWindowReads,
  "uncontrolled-emptiness": derivedLocalRule,
  "git-spawn-scrubbed": gitSpawnScrubbed,
} };

export default tseslint.config(
  {
    ignores: [
      "packages/*/dist/**",
      "node_modules/**",
      ".venv/**",
      "dist/**",
      "**/*.json",
      "src/eval/fixtures/**", // captured transcripts, not source
      "src/eval/pages/**", // HTML test fixtures
      "src/spike/fixtures/**",
    ],
  },

  // Baseline for every source file (.ts and the .mjs capture worker).
  js.configs.recommended,
  {
    files: ["**/*.{ts,mjs,js}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    plugins: { local },
    rules: {
      // --- Clean Code: Functions (block CI; these are what caught the
      // 160-line capture god-function and the trailing flag argument). ---
      "max-lines-per-function": ["error", { max: 70, skipBlankLines: true, skipComments: true }],
      // What a reader actually scrolls: PHYSICAL lines, comments and blank lines included. The budget above
      // skips comments, and that is right for this codebase (its comments carry NVDA quirks and WCAG
      // rationale that must not be squeezed out to fit a line count). The cost is that a comment-dense
      // function can run to twice that budget and still pass: `navigateByStructure` reached 154 physical
      // lines, and `board-report.mjs`'s `render` reached 157, with lint green throughout. So this second
      // budget lets a function be long BECAUSE it is well explained, and still refuses one that has quietly
      // become four functions. It was `function-size.test.ts` until #908. Measured then, the two agreed
      // exactly: the same 89 functions over 60 lines, with the same lengths. IIFEs are counted because that
      // test counted every function node.
      "local/max-physical-lines-per-function": [
        "error", { max: 90, skipBlankLines: false, skipComments: false, IIFEs: true },
      ],
      // #1144: EMPTY OPTION, AND THIS RULE PASSING IS THE MEASUREMENT -- every rollup read in the tree is
      // wrapped, or lint would be red. The list exists so a reader that genuinely does not need the newest
      // answer is CLASSIFIED rather than made to adopt a predicate it has no use for.
      "local/bounded-window-reads": ["error", { wideWindowIsHarmless: [] }],
      // #1155: EXEMPT BY NAME, with the reason here rather than inferred by the rule. That file
      // reproduces the naive check -- "0 checked, 0 missing" -- to demonstrate that a check which
      // examined nothing and a check which examined everything produce the same sentence. It is a
      // DEMONSTRATION of this rule's defect, inside the guard file for this rule's defect, and it must
      // stay vacuous. A rule clever enough to recognise a demonstration is one that will excuse a real
      // defect: the recognition would key on something a real defect can also carry.
      // #1155: EXEMPT BY NAME WITH ONE OF TWO REASONS, never one option doing both jobs (ceo's ruling).
      // "Controlled by a guard this rule cannot see" and "the vacuity is the point" are different claims,
      // and a single reason carrying both makes the list unreadable -- which is the failure an exemption
      // list exists to prevent. A third kind of reason is a ROW, not a third entry.
      // #1185: converted from `git-spawn-classification.test.ts` (#908). EMPTY OPTION BY MEASUREMENT --
      // 79 of 79 files spawning git already import and call a canonical helper, so this holds a line
      // rather than finding gaps, and the lint run passing IS that measurement.
      "local/git-spawn-scrubbed": ["error", { dataNotASpawn: [] }],
      "local/uncontrolled-emptiness": ["error", { exempt: {
        // The naive check reproduced on purpose -- "0 checked, 0 missing" -- to show that examining
        // nothing and finding nothing produce the same sentence. A demonstration of this rule's defect,
        // inside the guard file for this rule's defect, and it must stay vacuous.
        "packages/lab/src/packaging/git-population-vacuity.test.ts": "demonstration",
        // `CORPUS_GUARD` is DERIVED from `samples.length > 0` and consumed as an early return, so the
        // assertion is unreachable with an empty population. The control was already there; pinning it
        // again would turn an honest skip into a failure on a checkout with no corpus.
        "packages/lab/src/capture/verify.corpus.test.ts": "guarded-by labCorpusReadable",
      } }],
      "complexity": ["error", 15], // "do one thing": decision points (stricter than ESLint's default 20)
      "max-depth": ["error", 3], // "indent level should not be greater than one or two"
      "max-params": ["error", 4], // flag/polyadic args -> use an argument object

      // --- Clean Code: error handling. A bare `catch {}` swallows the failure;
      // our whole diagnostics model exists to avoid exactly that. ---
      "no-empty": ["error", { allowEmptyCatch: false }],

      // --- Clean Code: G25 replace magic numbers with named constants. Valuable but noisy, so surfaced,
      // never gated.
      //
      // TRIAGED 6 Aug, all 321 of them, so the count is not mistaken for 321 unexamined defects:
      //
      //   150  in tests and benchmarks, where the literal IS the fixture data. The book explicitly allows
      //        tests to trade a little rigour for readability, and naming `expect(4)` buys nothing.
      //   171  in production code, and the commonest values are:
      //          200/400/429/500  HTTP status codes — CLAUDE.md exempts these by name
      //          1024             byte arithmetic; `bytes / 1024 / 1024` is self-explanatory (G25's own test
      //                           is "not ALREADY self-explanatory", not "not a literal")
      //          5050             always as `process.env.DATASET_PAGES_PORT || 5050`, i.e. an env default
      //                           beside the name that explains it. Centralising it would need worker-fleet
      //                           to import from lab, inverting the dependency direction — worse architecture
      //                           for a cosmetic gain.
      //          1000/60/24       time conversions, in expressions that state their own units
      //
      // Conclusion: reviewed and accepted, not deferred. If this count climbs a lot, re-triage rather than
      // assuming the new ones are the same kind. ---
      "no-magic-numbers": [
        "warn",
        { ignore: [0, 1, -1, 2], ignoreArrayIndexes: true, enforceConst: true, ignoreDefaultValues: true },
      ],
    },
  },

  // TypeScript-specific recommendations (unused vars, no-explicit-any, etc.).
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ["**/*.ts"] })),
);
