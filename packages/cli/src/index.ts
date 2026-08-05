/**
 * The renderer, so a consumer can print our report shape without reimplementing it.
 *
 * Deliberately the whole public surface. The CLI itself is a `bin`, not a library: it leases a worker, drives a
 * capture over HTTP, judges it, optionally merges an axe run, and prints. Every one of those pieces is already
 * a package of its own, so exporting a second way to orchestrate them would be two APIs to keep honest.
 */
export { reportLines } from "./report.js";
export type { Report } from "./report.js";
