// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): every URL naming PRODUCT_REPO resolves. Composes the exported halves of
// `scripts/check-transfer-urls.mjs` -- discovery and classification -- which `check-transfer-urls.test.ts`
// already asserts on, so this adds no second copy of either. Until the transfer (#63) lands every one of these
// answers 404: that is the interval #524 said nothing tracked, and naming it nightly is this check's job.
import { checkTransferUrls, findTransferUrls } from "../check-transfer-urls.mjs";

/** @typedef {import("../check-transfer-urls.mjs").TransferUrlResult} TransferUrlResult */

/**
 * @param {string} root
 * @param {{ fetchImpl?: (url: string, init: { method: string, redirect: "follow" }) => Promise<{ status: number, ok: boolean }> }} [options]
 * @returns {Promise<import("./check-result.mjs").CheckResult>}
 */
export async function check(root, { fetchImpl } = {}) {
  const sites = findTransferUrls(root);
  // The script's own fetch, not a wrapped one: a second raw fetch call here would be one more site for
  // `fetch-wrapper-coverage.test.ts` to classify, for no gain. A hung socket is bounded by Node's own
  // timeouts, and the nightly job's step timeout (#948) bounds the whole report.
  const results = await checkTransferUrls(sites, fetchImpl ? { fetchImpl } : {});
  if (results.length > 0 && results.every((r) => !r.reachable)) {
    const first = /** @type {TransferUrlResult & { error: string }} */ (results[0]);
    throw new Error(`none of ${results.length} URL(s) could be reached (first: ${first.error}) -- no network, not ${results.length} dead links`);
  }
  return {
    examined: results.length,
    unit: "URLs naming the product repository, fetched",
    disagreements: results.filter((r) => !r.ok).map((r) => ({
      where: `${r.file}:${r.line}`,
      reference: r.url,
      why: r.reachable ? `answered ${r.status}` : `could not be reached (${r.error}) -- not the same as broken`,
    })),
  };
}
