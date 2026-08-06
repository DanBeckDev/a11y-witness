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
    rules: {
      // --- Clean Code: Functions (block CI; these are what caught the
      // 160-line capture god-function and the trailing flag argument). ---
      "max-lines-per-function": ["error", { max: 70, skipBlankLines: true, skipComments: true }],
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
