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
  /** Fields that can be addressed AND filled, each with the verb its control's role takes. */
  addressable: { name: string; verb: "value" | "choose" | "check"; within?: string; nth?: number }[];
  /**
   * Fields NVDA announced with NO name, by position in reading order.
   *
   * Not an error and not a warning — a finding. It is reported whether or not the author ever configures
   * this form, because it is a fact about the page rather than about the config.
   */
  unnamed: { position: number; announced: string }[];
  /**
   * Buttons, offered as `submit:` candidates rather than as things to type into.
   *
   * `structure.formFields` is NVDA's FORM-FIELD quick-nav, and it visits buttons — the census comment says
   * so outright: *"the census counts the roles NVDA's form-field quick-nav actually visits — buttons
   * included."* Found by running the emitter against a real page, where `"Submit Search", button` was
   * drafted with `value: ""`. Typing into a button is not a thing, so the verb was wrong for the control,
   * which is the exact confusion the three-verb schema exists to prevent — arriving through the generator
   * instead of through the config.
   */
  submitCandidates: string[];
  /**
   * Announcements the grammar could not resolve into an object at all.
   *
   * SEPARATE from `unnamed`, and keeping them apart is the whole point. `unnamed` is a claim about the
   * PAGE — a control with no accessible name, which is 4.1.2. This is a claim about our own parser, and
   * conflating them puts a false accessibility finding into a generated artefact.
   *
   * It is not hypothetical: measured 2026-09-02, `parseAnnouncement` returns NO objects for every
   * checkbox, because `CONTROL_ROLES` carries `"checkbox"` and NVDA says `"check box"`. The local corpus
   * copy holds 22 announcements with NVDA's spelling and 0 with the grammar's. So a real W3C tutorial page
   * with a correctly-labelled `"Subscribe to newsletter, check box"` was reported as an unnamed field —
   * a false 4.1.2 against a conformant control. See the backlog.
   */
  unparsed: { position: number; announced: string }[];
}

/**
 * Which VERB a control's role takes — the schema's three verbs, matched to the controls that accept them.
 *
 * A button is absent on purpose (it is a `submit:` candidate, not something to fill), and so is static
 * prose. The mapping exists because getting it wrong is not cosmetic: a draft that offers `value: ""` on
 * a checkbox has told the author to type into it, which is the confusion the three-verb schema was
 * designed to prevent. Both halves of that were live bugs found by running this against real pages —
 * a button drafted as typeable, then a checkbox drafted the same way the moment the grammar could see one.
 */
const VERB_FOR_ROLE: Readonly<Record<string, "value" | "choose" | "check">> = Object.freeze({
  "edit": "value", "edit text": "value", "spin button": "value", "slider": "value",
  "combo box": "choose", "list box": "choose",
  "check box": "check", "radio button": "check", "radio": "check",
});

/**
 * One field's name, role and enclosing group, from the capture's OWN grammar.
 *
 * `role` is carried rather than discarded because the control's type decides which verb applies, and
 * running this against a real page proved the point: without it, a button was drafted as something to
 * type into.
 */
function describe(announced: string): { name: string; role: string; group: string | undefined } {
  const parsed = parseAnnouncement(announced, "sweep");
  const object = parsed.objects.find((o) => o.name !== "" || o.role !== "");
  // The INNERMOST container is the useful one for disambiguation: "Billing address" tells the two
  // "Address line 1" fields apart, where the page-wrapping landmark they share tells you nothing.
  const group = parsed.containers.length ? parsed.containers[parsed.containers.length - 1].name : undefined;
  return { name: object?.name ?? "", role: object?.role ?? "", group: group || undefined };
}

const quote = (value: string): string => JSON.stringify(value);

/**
 * Build the addressable list, filling in a disambiguator ONLY where a name actually collides.
 *
 * Adding `within:` everywhere would be noise, and worse: it would bind every field to a container that
 * may change for reasons unrelated to the field, so a page edit elsewhere breaks a config that did not
 * need the constraint.
 */
function addressable(
  fields: { name: string; verb: "value" | "choose" | "check"; group?: string }[],
): FormsDraft["addressable"] {
  const seen = new Map<string, number>();
  for (const field of fields) seen.set(field.name, (seen.get(field.name) ?? 0) + 1);
  const used = new Map<string, number>();
  return fields.map((field) => {
    const base = { name: field.name, verb: field.verb };
    if ((seen.get(field.name) ?? 0) < 2) return base;
    const ordinal = (used.get(field.name) ?? 0) + 1;
    used.set(field.name, ordinal);
    // `within` first, `nth` only when there is no group to name — the ordering ADR 0024 settled, because
    // a group is how a person distinguishes them and a count is how a machine does.
    return field.group ? { ...base, within: field.group } : { ...base, nth: ordinal };
  });
}

/** The starting value a verb is drafted with — blank for the author to fill, never a guess. */
const BLANK_FOR: Readonly<Record<string, string>> = Object.freeze({
  value: '""', choose: '""', check: "false",
});

function fieldLines(entries: FormsDraft["addressable"]): string[] {
  return entries.flatMap((entry) => [
    `          - field: ${quote(entry.name)}`,
    ...(entry.within ? [`            within: ${quote(entry.within)}   # DRAFTED: two fields share this name`] : []),
    ...(entry.nth ? [`            nth: ${entry.nth}   # DRAFTED: two fields share this name and no group names them`] : []),
    `            ${entry.verb}: ${BLANK_FOR[entry.verb]}              # TODO`,
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
 * Phrases this tool could not read, said as such.
 *
 * Deliberately worded as a limitation of the tool rather than of the page. The author cannot fix our
 * parser and must not be sent looking for a defect that is ours — which is what putting these under
 * "UNNAMED FIELD" did.
 */
function unparsedLines(unparsed: FormsDraft["unparsed"]): string[] {
  return unparsed.flatMap((field) => [
    "",
    `      # NOT UNDERSTOOD by a11y-witness, ${field.position} in reading order:`,
    `      #   ${field.announced}`,
    "      # This is a gap in THIS TOOL's announcement grammar, not a finding about your page.",
    "      # Add the field by hand if you need it configured.",
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
  const at = (field: { index: number; announced: string }) =>
    ({ position: field.index + 1, announced: field.announced });

  // FOUR outcomes, and collapsing any two of them is how this goes wrong.
  //
  // A button is a submit candidate, not something to type into. A named fillable control is what the
  // config is for. A control announced with no name is a 4.1.2 finding about the PAGE. And a phrase the
  // grammar could not resolve at all is a fact about OUR PARSER, which must never be reported as the
  // third — that is a false accessibility finding, and it is what this emitter did on its first run
  // against a real page.
  const unparsed = described.filter((field) => field.role === "" && field.name === "").map(at);
  const resolved = described.filter((field) => field.role !== "" || field.name !== "");
  const submitCandidates = [...new Set(
    resolved.filter((field) => field.role === "button" && field.name !== "").map((field) => field.name),
  )];
  const fillable = resolved.filter((field) => VERB_FOR_ROLE[field.role] !== undefined);
  // EVERY resolved-but-unnamed control, not only the fillable ones -- an unnamed BUTTON is exactly as
  // much a 4.1.2 finding as an unnamed edit field, and deriving this from `fillable` silently dropped it:
  // a button is excluded from `fillable` (it takes no verb) and from `submitCandidates` (no name to
  // offer), so it vanished from the draft entirely. Measured: `[", button"]` produced `unnamed: []`,
  // contradicting this file's own header -- "an author who never fills the file in has still learned
  // something" promises no silent omission, and this was one.
  const unnamed = resolved.filter((field) => field.name === "").map(at);
  const entries = addressable(fillable
    .filter((field) => field.name !== "")
    .map((f) => ({ name: f.name, verb: VERB_FOR_ROLE[f.role], group: f.group })));

  const yaml = [
    "# Drafted by a11y-witness from what NVDA announced. Fill in the values; the names are already right.",
    "#",
    "# A `success` state COMPLETES the form. Supplying one is how you say that is acceptable — leave it out",
    "# and nothing is submitted with valid data. Run with --plan to see exactly what would be submitted.",
    "version: 1",
    `origin: ${quote(options.origin)}`,
    "forms:",
    `  - form: ${quote(options.formName ?? "TODO the form's accessible name")}`,
    // DRAFTED from the buttons actually announced, rather than left as a TODO the author has to go and
    // look up. Where several were found the rest are listed beside it, because guessing which one submits
    // is not something this tool can do and pretending otherwise would put the wrong control in the file.
    `    submit: ${quote(options.submitName ?? submitCandidates[0] ?? "TODO the control that submits it")}`
      + (submitCandidates.length > 1
        ? `   # buttons found: ${submitCandidates.map((c) => JSON.stringify(c)).join(", ")}`
        : ""),
    "    states:",
    "      - state: error",
    '        because: ""             # TODO what does this form reject?',
    "        fields:",
    ...fieldLines(entries),
    ...unnamedLines(unnamed),
    ...unparsedLines(unparsed),
    "",
  ].join("\n");

  return { yaml, addressable: entries, unnamed, submitCandidates, unparsed };
}
