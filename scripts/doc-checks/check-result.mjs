// @ts-check
// THE SHAPE EVERY DOC CROSS-REFERENCE CHECK RETURNS (#905), and the one place it is defined.
//
// `examined` is how many things the check READ -- files, links, citations -- never how many passed. A check
// that examined nothing and found nothing reads `examined 0` in the report, which is a different answer from
// "no disagreements", and the report says so. That distinction is the whole reason the count is here: a
// cross-reference sweep that reports nothing having read nothing is the cleanest possible output, and this
// project has shipped that shape before.

/**
 * One cross-reference that does not resolve: WHERE it was written, WHAT it points at, and WHY it fails.
 * @typedef {{ where: string, reference: string, why: string }} Disagreement
 */

/**
 * @typedef {{ examined: number, unit: string, disagreements: Disagreement[] }} CheckResult
 */

export {};
