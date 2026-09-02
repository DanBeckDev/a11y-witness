/**
 * Draft a forms config from what the screen reader actually announced — ADR 0024's "make it easy" half.
 *
 * Nobody writes the config from scratch. A capture already records every form field's announced name in
 * `structure.formFields`, so the skeleton can be generated and the author only supplies values.
 *
 * **The draft is itself an accessibility report**, and that is the part worth protecting. A field NVDA
 * announced with no name cannot be addressed by this config — and cannot be addressed by a screen reader
 * user either, which is the 4.1.2 failure. So it is emitted as a NAMED COMMENT rather than skipped: an
 * author who never fills the file in has still learned something, and a silently omitted field would be
 * the empty-channel defect arriving in a generated artefact.
 *
 * Disambiguation is solved HERE rather than in the schema, because the easiest API for a name collision
 * is one the author never writes. Two fields sharing a name get `within:` filled in from the group NVDA
 * announced around them — which is how a screen reader user tells them apart — and `nth:` only when there
 * is no group to name.
 */
import { parseAnnouncement } from "@a11y-witness/evidence";

/** What a draft found, so a caller can report on it rather than only print it. */
export interface FormsDraft {
  /** The YAML text. */
  yaml: string;
  /** Fields that can be addressed: announced with a name. */
  addressable: { name: string; within?: string; nth?: number }[];
  /**
   * Fields NVDA announced with NO name, by position in reading order.
   *
   * Not an error and not a warning — a finding. It is reported whether or not the author ever configures
   * this form, because it is a fact about the page rather than about the config.
   */
  unnamed: { position: number; announced: string }[];
}

/** One field's name and the group announced around it, from the capture's own grammar. */
function describe(announced: string): { name: string; group: string | undefined } {
  const parsed = parseAnnouncement(announced, "sweep");
  const object = parsed.objects.find((o) => o.name !== "" || o.role !== "");
  // The INNERMOST container is the useful one for disambiguation: "Billing address" tells the two
  // "Address line 1" fields apart, where the page-wrapping landmark they share tells you nothing.
  const group = parsed.containers.length ? parsed.containers[parsed.containers.length - 1].name : undefined;
  return { name: object?.name ?? "", group: group || undefined };
}

const quote = (value: string): string => JSON.stringify(value);

/**
 * Build the addressable list, filling in a disambiguator ONLY where a name actually collides.
 *
 * Adding `within:` everywhere would be noise, and worse: it would bind every field to a container that
 * may change for reasons unrelated to the field, so a page edit elsewhere breaks a config that did not
 * need the constraint.
 */
function addressable(fields: { name: string; group?: string }[]): FormsDraft["addressable"] {
  const seen = new Map<string, number>();
  for (const field of fields) seen.set(field.name, (seen.get(field.name) ?? 0) + 1);
  const used = new Map<string, number>();
  return fields.map((field) => {
    if ((seen.get(field.name) ?? 0) < 2) return { name: field.name };
    const ordinal = (used.get(field.name) ?? 0) + 1;
    used.set(field.name, ordinal);
    // `within` first, `nth` only when there is no group to name — the ordering ADR 0024 settled, because
    // a group is how a person distinguishes them and a count is how a machine does.
    return field.group ? { name: field.name, within: field.group } : { name: field.name, nth: ordinal };
  });
}

function fieldLines(entries: FormsDraft["addressable"]): string[] {
  return entries.flatMap((entry) => [
    `          - field: ${quote(entry.name)}`,
    ...(entry.within ? [`            within: ${quote(entry.within)}   # DRAFTED: two fields share this name`] : []),
    ...(entry.nth ? [`            nth: ${entry.nth}   # DRAFTED: two fields share this name and no group names them`] : []),
    `            value: ""              # TODO`,
  ]);
}

function unnamedLines(unnamed: FormsDraft["unnamed"]): string[] {
  return unnamed.flatMap((field) => [
    "",
    `      # UNNAMED FIELD, ${field.position} in reading order. NVDA announced ${quote(field.announced)}.`,
    "      # This tool cannot address it, and neither can a screen reader user.",
    "      # Reported as 4.1.2 whether or not you configure this form.",
  ]);
}

/**
 * @param formFields the capture's `structure.formFields` — NVDA's announcements, in reading order
 * @param options `origin` is required in the output, so it is required here rather than left as a TODO:
 *   a config that is missing it is refused at parse time, and emitting a file that cannot load is worse
 *   than emitting one that is incomplete.
 */
export function draftFormsConfig(
  formFields: readonly string[],
  options: { origin: string; formName?: string; submitName?: string },
): FormsDraft {
  const described = formFields.map((announced, index) => ({ announced, index, ...describe(announced) }));
  const named = described.filter((field) => field.name !== "");
  const unnamed = described
    .filter((field) => field.name === "")
    .map((field) => ({ position: field.index + 1, announced: field.announced }));
  const entries = addressable(named.map((f) => ({ name: f.name, group: f.group })));

  const yaml = [
    "# Drafted by a11y-witness from what NVDA announced. Fill in the values; the names are already right.",
    "#",
    "# A `success` state COMPLETES the form. Supplying one is how you say that is acceptable — leave it out",
    "# and nothing is submitted with valid data. Run with --plan to see exactly what would be submitted.",
    "version: 1",
    `origin: ${quote(options.origin)}`,
    "forms:",
    `  - form: ${quote(options.formName ?? "TODO the form's accessible name")}`,
    `    submit: ${quote(options.submitName ?? "TODO the control that submits it")}`,
    "    states:",
    "      - state: error",
    '        because: ""             # TODO what does this form reject?',
    "        fields:",
    ...fieldLines(entries),
    ...unnamedLines(unnamed),
    "",
  ].join("\n");

  return { yaml, addressable: entries, unnamed };
}
