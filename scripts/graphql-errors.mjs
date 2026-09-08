// @ts-check
/**
 * WHAT GITHUB'S GRAPHQL ACTUALLY SAID, so a refusal can name the cause instead of the command.
 *
 * `board-snapshot.mjs` refused correctly for three hours with a sentence that could not be acted on:
 *
 *     board-snapshot: could not read Project 2 items -- refusing to snapshot a partial board.
 *     Command failed: gh api graphql -f query=...
 *
 * The API's own answer was `FORBIDDEN ... Resource not accessible by personal access token`, and that
 * one line separates four causes needing four different fixes — no permission, wrong project number,
 * user-vs-org project shape, or a query the schema rejects. #546 sat compatible with all four until
 * somebody dispatched a purpose-built probe. This repo's own rule is that a guard must be able to say
 * what it caught, and that two different faults must not print the same word.
 *
 * ## A 200 CAN CARRY `data` AND `errors` TOGETHER, and that is the half with teeth
 *
 * The probe that settled #546 returned, in one response:
 *
 *     {"data":{"viewer":{"projectsV2":{"totalCount":3,"nodes":[null,null,null]}}},
 *      "errors":[ ...FORBIDDEN x3 ]}
 *
 * **The token may COUNT what it may not READ.** A caller checking only the exit code, or only that
 * `data` is present, reads *three projects, all empty* — a partial board wearing a complete one's
 * clothes, arriving through the `errors` array instead of through an exit code. That is the exact
 * failure `board-snapshot`'s refusal exists to prevent, by a door it was not watching.
 *
 * ## Where the body actually is — measured, not assumed
 *
 * Measured 2026-09-08 against the real API with a deliberately undefined field:
 *
 *     status  1
 *     stdout  {"errors":[{"path":[...],"extensions":{"code":"undefinedField",...},"message":"..."}]}
 *     stderr  gh: Field 'nosuchfield' doesn't exist on type 'User'
 *
 * So the machine-readable answer is on **stdout of a command that threw**, which is where nobody looks.
 * `execFileSync`'s Error carries it, and its `.message` carries only `Command failed: ...` plus whatever
 * one line `gh` chose to print.
 *
 * **AND THE ERROR'S OWN SHAPE VARIES.** That measured error has no `type` at all — it has
 * `extensions.code` — while #546's FORBIDDEN has `type`. Reading only the field the incident happened to
 * show would have produced `undefined: <message>` on the commonest class of GraphQL error there is.
 */

/**
 * @typedef {{ code: string, path: string, message: string }} GraphqlError
 */

/**
 * The `errors` array of a parsed GraphQL response, normalised. An empty array for a response that
 * carries none — including one that is not an object at all, since "no errors reported" and "not a
 * response" are told apart by the caller's own shape check, not here.
 *
 * @param {unknown} parsed a JSON-parsed response body
 * @returns {GraphqlError[]}
 */
export function graphqlErrorsIn(parsed) {
  const errors = /** @type {any} */ (parsed)?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((/** @type {any} */ e) => ({
    // BOTH spellings: `type` (FORBIDDEN, NOT_FOUND) and `extensions.code` (undefinedField, and every
    // other schema rejection). Neither is always present -- see this file's header.
    code: typeof e?.type === "string" ? e.type
      : typeof e?.extensions?.code === "string" ? e.extensions.code : "UNKNOWN",
    path: Array.isArray(e?.path) ? e.path.join(".") : "",
    message: typeof e?.message === "string" ? e.message : JSON.stringify(e ?? null),
  }));
}

/**
 * One line per error, `CODE at path: message`, for putting inside a refusal. Empty string for none, so a
 * caller can append it unconditionally.
 *
 * @param {GraphqlError[]} errors
 * @returns {string}
 */
export function describeGraphqlErrors(errors) {
  if (errors.length === 0) return "";
  return errors.map((e) => `${e.code}${e.path ? ` at ${e.path}` : ""}: ${e.message}`).join("; ");
}

/**
 * The errors inside whatever a failed `gh` invocation left behind. STDOUT FIRST, because that is where
 * the machine-readable body is on a command that threw; `stderr` is `gh`'s own one-line summary and is
 * the fallback only so a response shape this has not met still says something.
 *
 * @param {unknown} thrown the value caught from a `gh` call
 * @returns {GraphqlError[]}
 */
export function graphqlErrorsFromThrown(thrown) {
  for (const stream of ["stdout", "stderr"]) {
    const raw = /** @type {any} */ (thrown)?.[stream];
    if (raw === undefined || raw === null) continue;
    try {
      const errors = graphqlErrorsIn(JSON.parse(String(raw)));
      if (errors.length > 0) return errors;
    } catch {
      // Not JSON: `gh` printed a human sentence rather than a body. Not an error worth recording -- the
      // caller's own message already carries what the command said, and an empty result here means
      // "nothing MACHINE-READABLE to add", which is a true and useful answer.
      continue;
    }
  }
  return [];
}
