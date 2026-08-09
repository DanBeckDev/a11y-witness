/**
 * EARL — the W3C's machine-readable format for accessibility test results.
 *
 * Why bother, given it is a non-normative Working Group Note rather than a Recommendation: it is the only
 * vendor-neutral way to hand these results to another tool, and WCAG-EM names it as the machine-readable
 * option for reporting an evaluation. A team already aggregating axe, Pa11y or Lighthouse output can merge
 * ours without writing a parser for our shape.
 *
 * It could only be written after the outcomes model existed. EARL's `earl:outcome` is exactly ACT's
 * vocabulary — `earl:passed`, `earl:failed`, `earl:cantTell`, `earl:inapplicable`, `earl:untested` — so a
 * tool that reports only failures has nothing to say in four fifths of it. That mapping is one-to-one and
 * is the whole reason this file is short.
 *
 * Emitted as JSON-LD rather than RDF/XML or Turtle: EARL is an RDF vocabulary, JSON-LD is RDF, and it is
 * the serialisation a JavaScript consumer can read without a toolchain.
 *
 * https://www.w3.org/WAI/standards-guidelines/earl/
 */

/** ACT's five outcomes, which EARL names identically. */
export type EarlOutcome = "passed" | "failed" | "cantTell" | "inapplicable" | "untested";

export interface EarlAssertionInput {
  /** The page tested. EARL's `earl:subject`. */
  url: string;
  /** When the evaluation ran, ISO 8601. */
  date: string;
  /** Which screen reader and browser produced the evidence — the assertion's mode, in prose. */
  environment: string;
  /** Tool version, so an assertion can be traced to what produced it. */
  toolVersion: string;
  outcomes: readonly { criterion: string; outcome: EarlOutcome; reason: string }[];
}

/** WCAG success criteria have stable URIs; citing them is what makes an assertion resolvable. */
const criterionUri = (num: string): string =>
  `https://www.w3.org/TR/WCAG22/#${num}`;

/**
 * One EARL assertion per criterion.
 *
 * `earl:mode` is `earl:automatic` throughout and that is a claim worth being careful about: it says a tool
 * produced this without human judgement, which is true, and it is precisely why a consumer should weigh a
 * `failed` from us differently from a human evaluator's. The `reason` travels in `dct:description` so the
 * outcome is never separated from why — an EARL outcome on its own is a bare token, and this project's
 * whole position is that `cantTell` and `untested` are meaningless without their reason.
 */
export function earlReport(input: EarlAssertionInput): object {
  return {
    "@context": {
      earl: "http://www.w3.org/ns/earl#",
      dct: "http://purl.org/dc/terms/",
      WCAG22: "https://www.w3.org/TR/WCAG22/#",
    },
    "@graph": [
      {
        "@id": "_:assertor",
        "@type": "earl:Software",
        "dct:title": "a11y-witness",
        "dct:hasVersion": input.toolVersion,
        "dct:description": `Drives a real screen reader. Evidence produced by ${input.environment}.`,
      },
      {
        "@id": "_:subject",
        "@type": ["earl:TestSubject", "earl:WebPage"],
        "dct:source": input.url,
        "dct:date": input.date,
      },
      ...input.outcomes.map((entry, index) => ({
        "@id": `_:assertion-${index}`,
        "@type": "earl:Assertion",
        "earl:assertedBy": { "@id": "_:assertor" },
        "earl:subject": { "@id": "_:subject" },
        "earl:test": { "@id": criterionUri(entry.criterion) },
        // Automatic, and stated rather than implied: a consumer should weigh a machine `failed`
        // differently from a human evaluator's, and EARL gives the vocabulary to say which this is.
        "earl:mode": { "@id": "earl:automatic" },
        "earl:result": {
          "@type": "earl:TestResult",
          "earl:outcome": { "@id": `earl:${entry.outcome}` },
          // The reason travels WITH the outcome. A bare `cantTell` is a token; this project's position is
          // that it means nothing without what could not be determined and why.
          "dct:description": entry.reason,
        },
      })),
    ],
  };
}
