/**
 * The forms configuration — ADR 0024.
 *
 * Four criteria are only observable once a form has been submitted or typed into (3.3.1, 3.3.3, 4.1.3,
 * 3.2.2), and the probes that produce that evidence are OFF for a page we do not own, because pressing
 * *Book* on somebody's production site is not a review. What makes submitting acceptable is the site's
 * owner telling us what to put in the form — so the consent problem is an API problem, and this is the API.
 *
 * A form is configured with named STATES rather than with values plus a submit button. That is the
 * decision the whole file rests on and ADR 0024 records why: "submit empty" was a PROXY for "produce an
 * error", and on a real form the proxy is often wrong — the field may be optional, the button may be
 * disabled until valid, validation may be client-side and never announce. The site's owner knows what
 * their form rejects. Declaring it removes the guess, and it makes the destructive act separately
 * consentable: a `success` state is the licence to complete the form, and its absence is an instruction
 * rather than a gap.
 *
 * PURE. No file reads, no network, no worker. That is why the whole config layer can be proven before any
 * Windows machine is involved, which is the reason it is built first.
 */
import { parse as parseYaml } from "yaml";

/** v1 accepts these two and nothing else — see `assertStateName`. */
export const STATE_NAMES = ["error", "success"] as const;
export type StateName = (typeof STATE_NAMES)[number];

/**
 * One field, addressed the way a screen reader user addresses it.
 *
 * By ACCESSIBLE NAME, never by selector. Playwright moved to `getByLabel`/`getByRole` for robustness;
 * here it is also the only choice consistent with what this tool is, and it pays a dividend no
 * selector-based design can: a field that cannot be addressed by its accessible name is a FINDING rather
 * than a configuration error. If `"Email address"` will not bind because the input has no name, that IS
 * the 4.1.2 failure, and a screen reader user cannot address it either.
 */
export interface FieldSpec {
  field: string;
  /** Disambiguator, and the PRIMARY one: how a screen reader user tells two `"Address line 1"` apart. */
  within?: string;
  /** Fallback disambiguator, for a collision with no group to name. 1-based, as a person counts. */
  nth?: number;
  /** Text to type. */
  value?: string;
  /** An option to select — a different verb because a combo box is not an edit. */
  choose?: string;
  /** A checkbox or radio to set. */
  check?: boolean;
}

export interface StateSpec {
  state: StateName;
  /** What you expect to be rejected, in your words. Recorded so a run that hears NO error can say what it expected. */
  because?: string;
  fields: FieldSpec[];
}

export interface FormSpec {
  /** The form's accessible name. */
  form: string;
  /** The accessible name of the control that submits it. */
  submit: string;
  states: StateSpec[];
}

export interface FormsConfig {
  version: 1;
  /** The only origin this file may be applied to. */
  origin: string;
  forms: FormSpec[];
}

/** Thrown with a sentence a person can act on. A config error must never be a stack trace. */
export class FormsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormsConfigError";
  }
}

/**
 * Annotated on the CONST, not on the arrow, and that is load-bearing rather than stylistic: TypeScript
 * only treats a call as never-returning for control-flow narrowing when the identifier carries an
 * explicit type annotation. Written as `(message: string): never =>` it still throws at runtime while
 * every `if (bad) fail(...)` below fails to narrow, so each one needs a cast — which is how a validator
 * ends up full of assertions that hide the shape it is validating.
 */
const fail: (message: string) => never = (message) => {
  throw new FormsConfigError(message);
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Exactly one verb per field, and the count is checked rather than the presence.
 *
 * `value`, `choose` and `check` are three verbs because a control's type decides what "supplying a value"
 * means, and using one verb for all three would make the config lie about what the tool did to the page.
 * Zero verbs is a field nobody said what to do with; two is a field with contradictory instructions, and
 * silently preferring one would make the file's meaning depend on this function's order.
 */
function assertOneVerb(field: Record<string, unknown>, where: string): void {
  const verbs = (["value", "choose", "check"] as const).filter((verb) => field[verb] !== undefined);
  if (verbs.length === 1) return;
  fail(verbs.length === 0
    ? `${where} says nothing to do with "${String(field.field)}". Give it one of value:, choose: or check:.`
    : `${where} gives "${String(field.field)}" more than one instruction (${verbs.join(", ")}). `
      + "A field takes exactly one of value:, choose: or check:.");
}

function parseField(raw: unknown, where: string): FieldSpec {
  if (!isObject(raw)) fail(`${where} has a field entry that is not a mapping.`);
  const entry = raw as Record<string, unknown>;
  if (typeof entry.field !== "string" || entry.field.trim() === "") {
    fail(`${where} has a field with no field: name. Name it as the screen reader announces it.`);
  }
  assertOneVerb(entry, where);
  if (entry.nth !== undefined && (typeof entry.nth !== "number" || entry.nth < 1)) {
    fail(`${where}: nth: on "${String(entry.field)}" counts from 1, as a person counts.`);
  }
  return entry as unknown as FieldSpec;
}

/**
 * v1 accepts `error` and `success` and nothing else.
 *
 * A FIXED vocabulary is what makes "properly tested" computable: each criterion declares which states it
 * needs, so a config carrying only an error state can be reported as giving half an answer for 4.1.3
 * rather than a whole one. Free-text state names would turn that back into a judgement. Custom states are
 * v2, alongside multi-step flows.
 */
function assertStateName(value: unknown, where: string): asserts value is StateName {
  if (!STATE_NAMES.includes(value as StateName)) {
    fail(`${where}: state: must be ${STATE_NAMES.join(" or ")}, not ${JSON.stringify(value)}. `
      + "v1 uses a fixed vocabulary so that which criteria a config can answer is computable.");
  }
}

function parseState(raw: unknown, where: string): StateSpec {
  if (!isObject(raw)) fail(`${where} has a state entry that is not a mapping.`);
  const entry = raw as Record<string, unknown>;
  assertStateName(entry.state, where);
  if (!Array.isArray(entry.fields) || entry.fields.length === 0) {
    fail(`${where}: the "${String(entry.state)}" state lists no fields:, so there is nothing to put in the form.`);
  }
  const label = `${where} state "${String(entry.state)}"`;
  return {
    state: entry.state,
    because: typeof entry.because === "string" ? entry.because : undefined,
    fields: entry.fields.map((field) => parseField(field, label)),
  };
}

function parseForm(raw: unknown, index: number): FormSpec {
  if (!isObject(raw)) fail(`forms[${index}] is not a mapping.`);
  const entry = raw as Record<string, unknown>;
  const where = typeof entry.form === "string" ? `form "${entry.form}"` : `forms[${index}]`;
  if (typeof entry.form !== "string" || entry.form.trim() === "") {
    fail(`forms[${index}] has no form: name. Use the form's accessible name, as the screen reader announces it.`);
  }
  if (typeof entry.submit !== "string" || entry.submit.trim() === "") {
    fail(`${where} has no submit: control. Name the control that submits it.`);
  }
  if (!Array.isArray(entry.states) || entry.states.length === 0) {
    fail(`${where} declares no states:. A form is configured with the states you can put it in — `
      + `${STATE_NAMES.join(" and ")}.`);
  }
  return {
    form: entry.form,
    submit: entry.submit,
    states: entry.states.map((state) => parseState(state, where)),
  };
}

/**
 * Parse and validate a forms config.
 *
 * Rejects loudly rather than tolerantly, and the asymmetry with `axe-results.ts` is deliberate: that
 * module is tolerant because "axe results" means several packagings of the same substance, whereas THIS
 * file instructs the tool to type into and submit somebody's live form. A misunderstood field there
 * produces a wrong count; here it produces a real action on a real site.
 */
export function parseFormsConfig(text: string, path = "the forms config"): FormsConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (cause) {
    throw new FormsConfigError(`${path} is not valid YAML: ${(cause as Error).message}`);
  }
  if (!isObject(parsed)) fail(`${path} is empty or is not a mapping.`);
  const doc = parsed as Record<string, unknown>;
  if (doc.version !== 1) {
    fail(`${path}: version: must be 1 (found ${JSON.stringify(doc.version ?? null)}).`);
  }
  if (typeof doc.origin !== "string" || doc.origin.trim() === "") {
    fail(`${path}: origin: is required. It names the only site this file may be applied to, and it is `
      + "what stops a staging config being aimed at production.");
  }
  if (!Array.isArray(doc.forms) || doc.forms.length === 0) {
    fail(`${path}: forms: lists nothing, so this file would do nothing.`);
  }
  return {
    version: 1,
    origin: doc.origin,
    forms: doc.forms.map(parseForm),
  };
}

/**
 * May this config be applied to this URL?
 *
 * The guard is the origin and not the full URL, because a config describes a SITE's forms and a run names
 * one page of it. Compared by parsed origin rather than by string prefix: `https://example.com` must not
 * match `https://example.com.attacker.test`, which a `startsWith` would accept.
 *
 * This file holds data its author considered safe to send TO THAT SITE. Applying it elsewhere would send
 * it somewhere they never agreed to, so a mismatch is a refusal and never a warning.
 */
export function refuseIfWrongOrigin(config: FormsConfig, url: string): void {
  const originOf = (value: string): string | null => {
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  };
  const declared = originOf(config.origin);
  const target = originOf(url);
  if (declared === null) fail(`origin: ${JSON.stringify(config.origin)} is not a URL.`);
  if (target !== null && target === declared) return;
  fail(`This forms config declares origin ${declared}, and the run is against ${target ?? url}. `
    + "Refusing: the values in a forms config were supplied for one site, and sending them to another "
    + "is not something a tool may decide to do.");
}
