// @ts-check
// command: (not a command) the ESLint rule for #1155, imported by eslint.config.js
// AN EMPTINESS ASSERTION ON A LOCALLY DERIVED COLLECTION, WITH NOTHING PINNING WHAT IT WAS DERIVED FROM.
//
// `assert.deepEqual(offenders, [])` where `const offenders = files.filter(...)` is satisfied by an EMPTY
// `files`. The control belongs on `files`, and pinning `offenders` proves nothing -- it is the subject,
// not the population. #1123 measured 226 such assertions across 135 files and, more usefully, measured
// that they are not one population: 73 accumulators, 64 derived-local, 64 derived-from-a-call, and 35
// other. **The remedy differs per shape**, which is why `ceo` ruled a rule for the derived-local 64 only.
//
// ## What this rule deliberately does NOT do
//
// **The receiver must be an IDENTIFIER.** `const xs = f().filter(...)` is out of scope by that same
// ruling: the rule can see the shape and cannot see the population, because what `f()` returns is not
// here. Flagging it would produce a report nobody can act on except by restructuring the test, and a rule
// whose remedy is "write it differently" is a style rule wearing a correctness rule's name.
//
// **Accumulators are out of scope and are the bigger half.** `const xs = []; for (...) xs.push(...)`
// needs its control on the LOOP'S SOURCE, which is neither the asserted name nor its initialiser. #1123
// has its own row for defining that before anything is built for it.
//
// **The pin must be in the SAME TEST.** A `assert.ok(files.length)` in a neighbouring test does not
// control this one -- they run independently and either could be the one that stops examining anything.
// Searching the whole file would let one pin excuse every assertion in it, which is the shape where a
// control on the wrong object reads as a control.
//
// ## And why the exemption is by NAME rather than by cleverness
//
// `git-population-vacuity.test.ts` contains an emptiness assertion that CANNOT fail, deliberately: it
// reproduces the naive check -- *"0 checked, 0 missing"* -- to demonstrate that a check which examined
// nothing and a check which examined everything produce the same sentence. **That is a demonstration of
// this rule's defect inside the guard file for this rule's defect**, and it must stay exactly as it is.
//
// It is exempted BY NAME in the config, with the reason written there. **A rule clever enough to
// recognise a demonstration is a rule that will excuse a real one** -- the recognition would have to key
// on something a real defect can also carry (a comment, a name, a shape), and then the next author gets
// the exemption by accident. #1123's own measurement is the argument: all six assertions in the purest
// bucket read as defects and all six were correct, so the shape does not decide it and a human must.

/**
 * `assert.deepEqual(X, [])` -- the first of the two spellings #1123 measured.
 * @param {any} node @returns {any}
 */
function deepEqualEmptySubject(node) {
  const [first, second] = node.arguments ?? [];
  const isEmptyArray = second?.type === "ArrayExpression" && second.elements.length === 0;
  return first?.type === "Identifier" && isEmptyArray ? first : null;
}

/**
 * `assert.equal(X.length, 0)` -- the second spelling.
 * @param {any} node @returns {any}
 */
function lengthZeroSubject(node) {
  const [first, second] = node.arguments ?? [];
  if (second?.type !== "Literal" || second.value !== 0) return null;
  const isLength = first?.type === "MemberExpression" && first.property?.name === "length";
  return isLength && first.object?.type === "Identifier" ? first.object : null;
}

/**
 * The identifier whose emptiness this call asserts, or null.
 *
 * SPLIT IN TWO rather than disabled: the first version was one function at complexity 21 against a
 * ceiling of 15, and the `eslint-disable-next-line` I reached for did nothing -- `complexity` reports at
 * the function DECLARATION and the directive sat inside the body, so it was an unused directive beside a
 * live error. A disable that does not disable is the same shape as everything else found today: it had
 * the form of a suppression without being one.
 *
 * @param {any} node @returns {any}
 */
function emptinessSubject(node) {
  if (node.callee?.type !== "MemberExpression") return null;
  const method = node.callee.property?.name;
  if (method === "deepEqual") return deepEqualEmptySubject(node);
  if (method === "equal") return lengthZeroSubject(node);
  return null;
}

/**
 * The local collection `name` was derived from -- `SOURCE.filter(...)` -- or null if it was not.
 * @param {any} variable @returns {string | null}
 */
function derivedFrom(variable) {
  const def = variable?.defs?.[0];
  const init = def?.node?.type === "VariableDeclarator" ? def.node.init : null;
  if (init?.type !== "CallExpression" || init.callee?.type !== "MemberExpression") return null;
  const DERIVING = new Set(["filter", "map", "flatMap", "flat", "slice", "concat"]);
  if (!DERIVING.has(init.callee.property?.name)) return null;
  // THE RECEIVER MUST BE AN IDENTIFIER -- see the header. A call receiver is a population this rule
  // cannot see, and reporting it would be a finding with no action attached.
  return init.callee.object?.type === "Identifier" ? init.callee.object.name : null;
}

/**
 * The nearest enclosing `test(...)` / `it(...)` call, or null.
 * @param {any} node @returns {any}
 */
function enclosingTest(node) {
  for (let n = node; n; n = n.parent) {
    if (n.type === "CallExpression" && n.callee?.type === "Identifier"
      && (n.callee.name === "test" || n.callee.name === "it")) return n;
  }
  return null;
}

/** Does `source` get pinned non-empty anywhere inside `scope`? Text over the scope's own range. */
/**
 * Is `name` asserted non-empty anywhere in `sourceText`? Exported so the conjunction case is driven
 * directly rather than only through a lint run.
 * @param {string} sourceText the enclosing test's source
 * @param {string} name the population's identifier
 * @returns {boolean}
 */
export function pinnedWithin(sourceText, name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    // ANYWHERE INSIDE THE `assert.ok(...)`, not immediately after its paren. The first version required
    // the name to open the call, so `assert.ok(pr.length > 0 && nightly.length > 0, ...)` pinned `pr` and
    // not `nightly` -- a CONJUNCTION controls both operands, and the detector saw one.
    //
    // #1160 found it the expensive way: the rule reported an already-pinned site, the generated fix added
    // a second pin on top of a working control, and worker-judge found the redundancy. **It is the same
    // defect I had just corrected in #1123's own instrument** -- that one required `.length` to be
    // followed by `,` or `)`, so it read `assert.ok(x.length >= 5)` as no pin at all and overstated the
    // uncontrolled population by a factor of two. A pin detector that recognises one spelling of a pin
    // reports every other spelling as absent, and mine recognised one POSITION.
    //
    // `[^)]*` rather than `.*` so the search cannot run past the end of this call into the next one.
    `assert\\.ok\\([^)]*\\b${n}\\.length`
    + `|assert\\.equal\\(\\s*${n}\\.length\\s*,\\s*(?!0\\s*[,)])`
    + `|assert\\.notDeepEqual\\(\\s*${n}\\s*,`).test(sourceText);
}

/** @type {import("eslint").Rule.RuleModule} */
export const derivedLocalRule = {
  meta: {
    type: "problem",
    schema: [{ type: "object", properties: { exempt: { type: "object", additionalProperties: { type: "string" } } },
      additionalProperties: false }],
    messages: {
      uncontrolled: "`{{subject}}` is derived from `{{source}}`, and nothing in this test pins `{{source}}` "
        + "non-empty -- so this assertion passes when `{{source}}` is EMPTY, which is the case it exists to "
        + "rule out. The control belongs on the population, not on the filtered subject (#1123). Add "
        + "`assert.ok({{source}}.length > 0, ...)` in this test -- or, if a control is already here in a "
        + "form this rule cannot read, exempt the file in the rule's `exempt` option with one of exactly "
        + "two reasons: `demonstration` (the vacuity is the point, as in git-population-vacuity) or "
        + "`guarded-by <symbol>` (a guard outside an assertion makes the code unreachable when empty).",
      badReason: "`{{file}}` is exempted with the reason {{reason}}, which is neither `demonstration` nor "
        + "`guarded-by <symbol>`. An exemption whose reason cannot be read is one nobody can audit, and a "
        + "third kind of reason is a ROW rather than a third entry (ceo, #1155) -- because two reasons "
        + "carrying every case is how the list stops saying anything.",
    },
  },
  create(context) {
    const exempt = context.options?.[0]?.exempt ?? {};
    const here = context.filename.replace(`${process.cwd()}/`, "");
    const reason = exempt[here];
    if (reason !== undefined) {
      // THE REASON IS CHECKED, NOT JUST THE NAME. An exemption list whose entries carry free text drifts
      // into "because it was failing", and then nobody can tell an argued case from a silenced one. Two
      // shapes only -- ceo's ruling on #1155 -- and an entry that matches neither is itself an error, so
      // the list cannot rot quietly. `guarded-by` must NAME the symbol, because "a guard exists" is the
      // claim, and an unnamed one cannot be checked against the file.
      if (!/^demonstration$|^guarded-by \S+/.test(reason)) {
        return { Program(node) {
          context.report({ node, messageId: "badReason", data: { file: here, reason: JSON.stringify(reason) } });
        } };
      }
      return {};
    }
    const code = context.sourceCode;
    return {
      CallExpression(node) {
        const subject = emptinessSubject(node);
        if (!subject) return;
        const variable = code.getScope(node).references
          .find((r) => r.identifier === subject)?.resolved
          ?? code.getScope(node).variables.find((v) => v.name === subject.name);
        const source = derivedFrom(variable);
        if (!source) return;
        const test = enclosingTest(node);
        if (!test) return;
        if (pinnedWithin(code.getText(test), source)) return;
        context.report({ node, messageId: "uncontrolled",
          data: { subject: subject.name, source } });
      },
    };
  },
};
