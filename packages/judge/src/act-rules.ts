/**
 * Our deterministic rules, described in the form the W3C's ACT Rules Format requires.
 *
 * ACT specifies what a rule must state before anyone can judge whether its output means anything:
 * applicability, expectation, assumptions, accessibility-support limitations, and examples of each
 * outcome. We had all of that as prose comments beside the code — which is where it belongs for a reader
 * of the code, and nowhere at all for a reader of a report.
 *
 * The two fields that earn this file are `assumptions` and `accessibilitySupport`. Every wrong finding
 * this project has shipped traces to an assumption nobody had written down: that Chromium marks decorative
 * images as ignored (it does, but it also exposes CSS bullets as images), that a submit always stays on the
 * page (Wikipedia navigates), that a leading role token means an unnamed control (true only in the sweep,
 * not in a wrapped read-through). Writing them down is how the next one gets caught in review.
 *
 * These are OUR rules, not a claim to implement the ACT rules published by the community — those have
 * their own identifiers and test cases, and adopting them is a separate piece of work.
 *
 * https://www.w3.org/TR/act-rules-format/
 */
import type { RequirementMapping } from "./judge.js";

export interface ActRuleDescription {
  /** Stable identifier. Namespaced, because ACT identifiers must be unique within a rule set. */
  id: string;
  /** Bumped when applicability or expectation changes, so a report can say which version judged it. */
  version: string;
  name: string;
  /** What the rule checks, in plain language. */
  description: string;
  /** All of ours are atomic: none is composed from other rules' outcomes. */
  ruleType: "atomic";
  /** Which criteria this maps to, and whether a failure asserts non-conformance. */
  accessibilityRequirements: { criterion: string; mapping: RequirementMapping }[];
  /** What the rule reads. ACT calls these input aspects; ours are all screen-reader output. */
  inputAspects: string[];
  /** Which parts of the page the rule applies to. An empty set means `inapplicable`. */
  applicability: string;
  /** What must be true of a test target for it to pass. */
  expectation: string;
  /** What must hold for the rule to be correct — the field that catches the next wrong finding. */
  assumptions: string[];
  /** Where accessibility support limits what this rule can conclude. */
  accessibilitySupport: string;
}

const NVDA_EDGE = "Evidence is NVDA's announcements in Edge on Windows. Another screen reader may announce "
  + "the same markup differently, so an outcome here does not transfer to JAWS, VoiceOver or Orca.";

export const ACT_RULES: ActRuleDescription[] = [
  {
    id: "a11y-witness:unnamed-control",
    version: "2026-08-08",
    name: "Control announced with a role but no accessible name",
    description: "A user-interface component the screen reader announces as a bare role — \"combo box, "
      + "collapsed\" — has no accessible name, so a user cannot tell what it is for.",
    ruleType: "atomic",
    accessibilityRequirements: [
      { criterion: "4.1.2", mapping: "conformance" },
      // 3.3.2 DOWNGRADED TO `secondary` ON 2026-09-05, and this is the THIRD rule found asserting where the
      // criterion permits — after 3.3.3 and 3.2.1/3.2.2, both corrected the day before.
      //
      // This read "W3C describes this failure as a screen reader announcing 'edit text' with no indication
      // of the field's purpose, which fails 1.3.1, 3.3.2 and 4.1.2 together". The Understanding page says
      // the opposite about association: 3.3.2 does NOT require labels or instructions to be marked up,
      // identified, or associated with their controls — that is 1.3.1's subject — and it states that a
      // field can PASS 3.3.2 while FAILING 1.3.1.
      //
      // So "no accessible name" is not "no label". It is two cases we cannot separate:
      //
      //   no visible label and no instructions either -> 3.3.2 really fails
      //   a visible label that is not associated      -> 3.3.2 is SATISFIED; 1.3.1 and 4.1.2 fail
      //
      // AND OUR OWN CORPUS IS THE SECOND CASE. `form-unlabelled.bad` is
      // `<span>Recipient name</span><input name="recipient">` — text presented to the user that identifies
      // the control, which is exactly WCAG's definition of a label. 115 records assert a criterion their
      // page satisfies.
      //
      // The criterion also says "labels OR INSTRUCTIONS", and instructions may sit anywhere on the page.
      // A screen reader hears that text — it is in the transcript — but deciding that a given paragraph is
      // an instruction FOR a given field is the judgement, not the perception.
      //
      // 4.1.2 keeps `conformance` and is untouched: that clause is about the accessible NAME, which is
      // precisely what a bare role proves absent. The finding is not weaker, it is correctly attributed.
      { criterion: "3.3.2", mapping: "secondary" },
    ],
    inputAspects: ["structure.formFields", "interaction.controls", "transcript"],
    applicability: "Every control announced in the structural form-field sweep, and every transcript line "
      + "carrying a control role together with the empty-name marker (U+FFFC).",
    expectation: "After removing role and state tokens, something remains — that remainder is the name.",
    assumptions: [
      "NVDA announces the accessible name BEFORE the role, so an announcement beginning with its own role "
        + "has no name. Verified against real captures; it is why the sweep and the read-through are "
        + "treated differently.",
      "In the read-through a role and its name can wrap onto separate lines, so a leading role proves "
        + "nothing there — the U+FFFC marker is required instead. Assuming otherwise would flag every "
        + "labelled field on a narrow window.",
      "The role and state token lists are complete enough that a real name is never mistaken for a role. "
        + "A missing state token would leave a residue that reads as a name and hide a real failure.",
    ],
    accessibilitySupport: NVDA_EDGE,
  },
  {
    id: "a11y-witness:unlabelled-image",
    version: "2026-08-08",
    name: "Image announced as having no text alternative",
    description: "The screen reader itself reports the image as unlabelled, or the browser offers to "
      + "generate a description for it — which it only does when there is no text alternative.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "1.1.1", mapping: "conformance" }],
    inputAspects: ["transcript"],
    applicability: "Every transcript line announcing a graphic or image.",
    expectation: "The line neither says \"unlabelled\" nor carries Edge's missing-description prompt.",
    assumptions: [
      "Edge's \"To get missing image descriptions, open the context menu\" prompt appears BECAUSE there is "
        + "no text alternative. Measured as the stable signal: the word \"unlabeled\" itself was present in "
        + "only 2 of 3 captures of the same unchanged image, so keying on it alone missed a third of them.",
      "An image the screen reader announces at all is one the user meets. A decorative image correctly "
        + "marked `alt=\"\"` is ignored by the browser and never reaches this rule.",
    ],
    accessibilitySupport: NVDA_EDGE + " The missing-description prompt is specific to Edge; another browser "
      + "would need its own signal.",
  },
  {
    id: "a11y-witness:alt-text-is-a-filename",
    version: "2026-08-08",
    name: "Image alternative text is a file name",
    description: "Alt text like \"IMG 4821\" or \"logo.png\" is present but does not describe the image.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "1.1.1", mapping: "secondary" }],
    inputAspects: ["transcript"],
    applicability: "Every transcript line announcing a graphic whose accessible name survives role and "
      + "state stripping.",
    expectation: "The remaining name does not look like a file name.",
    assumptions: [
      "A file name cannot serve the equivalent purpose of the image. SECONDARY rather than conformance "
        + "because the criterion asks whether the alternative serves an equivalent PURPOSE, and a string "
        + "that looks like a file name could legitimately be the right description — a product code, or a "
        + "screenshot of a file listing.",
    ],
    accessibilitySupport: NVDA_EDGE,
  },
  {
    id: "a11y-witness:unnamed-graphic-count",
    version: "2026-08-08",
    name: "The page exposes images with no accessible name",
    description: "The accessibility tree reports images the screen reader never announced a name for, "
      + "including ones quick navigation walks straight past.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "1.1.1", mapping: "secondary" }],
    inputAspects: ["accessibility tree (census)"],
    applicability: "Runs when the tree census reports a non-zero count of images. Absent census means no "
      + "oracle, and the rule makes no claim.",
    expectation: "No image in the tree is both exposed to assistive technology and nameless.",
    assumptions: [
      "FIVE OF THE CRITERION'S SIX EXCEPTIONS ARE NOT CHECKED HERE, and the one that can bite is "
      + "CONTROLS, INPUT: 'If non-text content is a control or accepts user input, then it has a NAME that "
      + "describes its purpose.' An `<img>` inside a named button satisfies 1.1.1 through the BUTTON's "
      + "name — `name` is defined as 'text by which software can identify a component within web content "
      + "to the user', which the image itself need not carry. This rule counts tree images without a name "
      + "and would accuse one. It does not today: `rules:real-pages` is clean across 86 conformant pages. "
      + "Stated because an unstated assumption is where every wrong finding in this project has come from, "
      + "and because DECORATION is handled by construction while this one is handled by luck. (Time-Based "
      + "Media, Test, Sensory and CAPTCHA relax the requirement to 'descriptive identification' rather "
      + "than removing it, so a nameless one still fails.)",
      "An image node the browser exposes with no name is content a user meets. This rule has already been "
        + "WRONG once on exactly that assumption: Chromium exposes a CSS `list-style-image` bullet as an "
        + "unnamed image, and two bullets were reported as missing text alternatives on a page W3C "
        + "publishes as fully AA conformant. Generated content is now excluded — which is why this reads a "
        + "COUNT, not an announcement, and stays secondary.",
      "The census reflects the same document the screen reader read. A stale virtual buffer would break "
        + "that; see the open item in PLAN.md.",
    ],
    accessibilitySupport: "The census comes from Chromium's accessibility tree over DevTools, not from the "
      + "screen reader, so it reports what the BROWSER exposes. It is an oracle for completeness and is "
      + "never quoted as what a user heard.",
  },
  {
    id: "a11y-witness:vague-link-text",
    version: "2026-08-08",
    name: "Link text does not indicate where the link goes",
    description: "A link announced as \"click here\" or \"read more\" tells a user navigating by link "
      + "nothing about its destination.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "2.4.4", mapping: "secondary" }],
    inputAspects: ["structure.links"],
    applicability: "Every link announced in the structural link sweep.",
    expectation: "The link's accessible name is not one of the known non-descriptive phrases.",
    assumptions: [
      "SECONDARY, and this is the clearest case in the set. 2.4.4 permits the purpose to be determined "
        + "from the link's programmatically determined CONTEXT — its sentence, paragraph, list item or "
        + "table cell — so \"To apply for a permit, click here\" conforms. This rule cannot see that "
        + "context, so it is stricter than the criterion and closer to 2.4.9, which is AAA.",
      "A screen-reader user listening to a links list hears the name alone, which is why the finding is "
        + "still worth reporting even when the page conforms.",
    ],
    accessibilitySupport: NVDA_EDGE,
  },
  {
    id: "a11y-witness:no-headings",
    version: "2026-08-08",
    name: "A page of content with no headings",
    description: "There is no heading structure to skim, so reaching any part of the page means reading "
      + "all of it.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "1.3.1", mapping: "secondary" }],
    inputAspects: ["structure.headings", "accessibility tree (census)", "transcript"],
    applicability: "Pages with substantial content — at least 15 announced lines — where the tree CONFIRMS "
      + "zero headings. A fragment or an error page legitimately has none.",
    expectation: "The page exposes at least one heading.",
    assumptions: [
      "SECONDARY. 1.3.1 is about structure conveyed visually being programmatically determinable, and this "
        + "layer cannot see the visual side: a page with genuinely no headings conveys no heading structure "
        + "to lose. Having none is strong evidence that styled text stands in for headings; proof needs the "
        + "visual layer.",
      "The tree must corroborate. A sweep alone cannot tell \"this page has no headings\" from \"we could "
        + "not ask\" — the distinction this project spent 2,122 captures failing to make.",
    ],
    accessibilitySupport: NVDA_EDGE,
  },
  {
    id: "a11y-witness:autoplaying-audio",
    version: "2026-08-08",
    name: "Audio starts automatically with no way to stop it",
    description: "A page that plays audio on load, unmuted and with no visible control, gives a "
      + "screen-reader user no way to silence it.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "1.4.2", mapping: "secondary" }],
    inputAspects: ["DOM (media elements)"],
    applicability: "Every `audio` and `video` element the page declares. A capture with no media probe "
      + "result at all is not applicable — it is unchecked, and the rule makes no claim.",
    expectation: "Any element that autoplays is either muted or carries a native controls affordance.",
    assumptions: [
      "SECONDARY on two counts. The criterion applies to audio playing for more than THREE SECONDS, and "
        + "this rule cannot measure duration — a two-second notification chime autoplaying is not a "
        + "failure. And the mechanism to pause or stop need not be the native `controls` attribute; a "
        + "custom button elsewhere on the page satisfies it and we would not see it.",
      "`muted` media makes no sound, so there is nothing to control. Flagging it would report ordinary, "
        + "correct markup — muted autoplay is the standard technique for a background video.",
      "This is the one rule in the set whose evidence is NOT something a screen reader said. `autoplay` "
        + "and `muted` are DOM attributes with no accessibility-tree equivalent, so no announcement can "
        + "carry them. It is included because 1.4.2 is a non-interference criterion under WCAG §5.2.5, "
        + "applying to all content whether or not it is relied upon — and because autoplaying audio masks "
        + "the synthetic speech this tool's users depend on.",
    ],
    accessibilitySupport: "Independent of the screen reader: read from the DOM over DevTools, so it holds "
      + "for any browser that reports the attributes. It says nothing about whether the audio is actually "
      + "audible to a given user, only that the page declared it to start on its own.",
  },
  {
    id: "a11y-witness:input-purpose-invalid",
    version: "2026-09-06",
    name: "An `autocomplete` attribute does not identify a real input purpose",
    description: "A form field's `autocomplete` value is not a token from HTML's Autofill field name "
      + "table, so a user agent or assistive technology cannot fill it from the user's own stored data "
      + "even though the page tried to say what it is for.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "1.3.5", mapping: "secondary" }],
    inputAspects: ["DOM (autocomplete attribute)"],
    applicability: "Every `input`, `select` and `textarea` element whose `autocomplete` attribute is "
      + "present, non-empty, and not the bare state token `on`/`off`. A capture with no formInputs probe "
      + "result at all is not applicable — it is unchecked, and the rule makes no claim.",
    expectation: "The value is a well-formed autofill detail token per the HTML specification's fixed "
      + "qualifier order, matching a name in the Input Purposes list WCAG 1.3.5 references by H98.",
    assumptions: [
      "ONLY THE F107 HALF. 1.3.5 also fails when a personal-data field carries NO autocomplete attribute "
        + "at all — H98 is the criterion's only listed sufficient technique, so an absent value is arguably "
        + "just as unsatisfied as a malformed one. This rule does not claim that half: deciding which "
        + "fields \"collect information about the user\" independently of anything the markup already "
        + "asserts would need a word-sense judgement over labels and field names this project has already "
        + "paid for getting wrong once (corpus:starvation). Firing only when the page has already attempted "
        + "a purpose declaration sidesteps that guess: every field this rule examines is one whose own "
        + "markup asserts a purpose, so the only open question is whether the spelling is right.",
      "SECONDARY rather than asserted, on ACT rule 73f2c2's own authority: 'Custom taxonomy values may "
        + "satisfy WCAG 1.3.5 even if this rule fails.' An unrecognised token is not provably wrong the way "
        + "a missing alt attribute is — it is merely not H98's own named mechanism, and a real but "
        + "nonstandard taxonomy some assistive technology recognises is a second reading this rule cannot "
        + "rule out.",
      "The qualifier grammar is checked by POSITION, not fully validated — an out-of-order token "
        + "('billing shipping', a contact-type prefix on a non-contact field) reads the same as an unknown "
        + "one, which is correct for this rule's only question ('does this identify a purpose') but is not "
        + "a complete implementation of the ordering ACT rule 73f2c2 itself checks.",
    ],
    accessibilitySupport: "Independent of the screen reader: read from the DOM over DevTools, so it holds "
      + "for any browser that reports the attribute. It says nothing about whether the field is actually "
      + "one the criterion covers, only that the page's own markup asserted a purpose and spelled it wrong.",
  },
  {
    id: "a11y-witness:keyboard-trap",
    version: "2026-08-08",
    name: "Tab stopped moving, so focus is trapped",
    description: "Pressing Tab repeatedly stopped advancing while most of the page's controls had never "
      + "been reached, so a keyboard user cannot get past the current control.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "2.1.2", mapping: "secondary" }],
    inputAspects: ["interaction.focusOrder", "structure.formFields"],
    applicability: "Captures where the focus probe ran and recorded at least three tab stops. A capture "
      + "with no `focusOrder` is unchecked, not clean.",
    expectation: "Either focus keeps advancing, or it settles only after visiting every control the "
      + "form-field sweep found.",
    assumptions: [
      "The same control announced twice running means focus did not move. The capture probe stops there "
        + "deliberately and refuses to interpret it — its comment says the distinction between a trap and "
        + "the end of the document is the judge's call, and this rule is that call.",
      "TWO signals are required: the repeat, AND fewer distinct controls reached than the sweep found. The "
        + "second is what separates a trap from a genuinely short tab order, and it also defends against a "
        + "stale announcement, which this pipeline produces often enough to have a section about.",
      "SECONDARY because 2.1.2 allows focus to be moved away by 'unmodified arrow or tab keys or other "
        + "standard exit method', and permits a non-standard method if the user is advised of it. We press "
        + "Tab only, and we cannot see an on-page advisory, so a repeat is strong evidence and not proof.",
    ],
    accessibilitySupport: NVDA_EDGE + " Tab is pressed through the screen reader, so what is reported is "
      + "the focus order a screen-reader user experiences, which can differ from raw browser tab order.",
  },
  {
    id: "a11y-witness:stale-route-title",
    version: "2026-08-22",
    name: "The route changed and the page title did not",
    description: "Activating a navigation control moved the page to different content while the title the "
      + "screen reader announces stayed the same, so a user who checks where they are is told the name of "
      + "the page they left.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "2.4.2", mapping: "secondary" }],
    inputAspects: ["interaction.routeChange"],
    applicability: "Captures where the navigation probe ran, reached a link, and activated it. A capture "
      + "with no `routeChange`, or one whose probe recorded an error, is unchecked rather than clean.",
    expectation: "If the page's first heading changes after activating a navigation control, the title "
      + "reported by the screen reader changes too.",
    assumptions: [
      "A changed first heading means the view moved. This is the corroborating signal because the obvious "
        + "one is wrong: the failing page announced 'visited' — the link's own state — so a rule keyed on "
        + "silence would never fire on the page it was written for.",
      "The probe activates the FIRST link on the page. On a real site that may be a skip link or a plain "
        + "fragment jump, in which case the heading does not change either and this rule makes no claim. "
        + "That is a limit on what it can DETECT, never a source of false positives.",
      "SECONDARY because 2.4.2 requires a title that describes topic or purpose, and whether a given title "
        + "does so is human judgement. This rule proves only that the title no longer describes the content "
        + "on screen, which is a sufficient failure and not the whole criterion.",
    ],
    accessibilitySupport: NVDA_EDGE + " Both readings come from NVDA's own report-title command, the same "
      + "one that supplies the title on entry, so this is what a user hears when they ask where they are — "
      + "not an inference from the DOM, which is valid at every instant in this failure.",
  },
  {
    id: "a11y-witness:tab-order-contradicts-reading-order",
    version: "2026-08-22",
    name: "Tab visits the controls in a different order from the one the page reads in",
    description: "The sequence a keyboard user moves through does not match the sequence the content "
      + "implies, so the form operates in a different order from the one it presents.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "2.4.3", mapping: "secondary" }],
    inputAspects: ["interaction.focusOrder", "structure.formFields"],
    applicability: "Captures where the focus probe ran and both sequences contain at least two of the same "
      + "controls. Fewer than two in common is unchecked, not clean.",
    expectation: "The controls appearing in both sequences appear in the same relative order.",
    assumptions: [
      "The structural sweep visits the page in document order, so it stands for the order the content is "
        + "READ in. That is the comparison a screen reader can make and a static checker cannot: the DOM "
        + "has no reading order to contradict until something has walked it.",
      "Each control's FIRST visit is what counts. The tab order is a cycle — past the last control Tab "
        + "returns to the first — so a faithful recording ends by repeating what it began with, and "
        + "comparing it raw makes a conformant page differ from itself.",
      "Controls in only one sequence are ignored. `focusOrder` also holds links and anything else "
        + "focusable, and the form-field sweep holds controls Tab may never reach; counting either absence "
        + "would fire on every page with a nav bar.",
      "SECONDARY because 2.4.3 asks whether an order preserves MEANING, which is human judgement. A tab "
        + "order that contradicts the reading order is a sufficient failure and not the whole criterion.",
    ],
    accessibilitySupport: NVDA_EDGE + " Tab is pressed through the screen reader, so the order recorded is "
      + "the one a screen-reader user experiences, which can differ from raw browser tab order. Names are "
      + "compared after stripping the states only the focus channel announces ('focused', 'blank').",
  },
  {
    id: "a11y-witness:inert-skip-link",
    version: "2026-08-22",
    name: "The skip link does not skip anything",
    description: "Activating the page's skip link left focus exactly where the next Tab would have gone "
      + "anyway, so the repeated block still has to be tabbed through.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "2.4.1", mapping: "secondary" }],
    inputAspects: ["interaction.routeChange", "interaction.focusOrder"],
    applicability: "Captures where the navigation probe activated a link whose announced name contains "
      + "'skip' or 'jump', and the focus probe recorded an ordinary tab order to compare against. Anything "
      + "else is unchecked rather than clean.",
    expectation: "After activating the skip link, focus is somewhere other than the second stop of the "
      + "ordinary tab order.",
    assumptions: [
      "A skip link is NOT required by 2.4.1 — headings alone satisfy it (H69) and landmarks alone satisfy "
        + "it (ARIA11) — so this rule never fires on its absence. It reports only a mechanism that is "
        + "present and does nothing, which is the part no markup inspection can reach: a checker sees a "
        + "link and a plausible fragment href and passes the page.",
      "The activated control must announce as a skip link. The probe takes the FIRST link on the page, "
        + "which on a real site is as likely to be a logo, and focus not moving after activating a logo "
        + "says nothing about bypassing blocks.",
      "'Did nothing' is stated against the SECOND stop of the ordinary tab order, so the claim is that the "
        + "next Tab landed where it would have without the link. That is stronger than 'focus is near the "
        + "top' and needs no knowledge of where the repeated block ends.",
      "SECONDARY because 2.4.1 is satisfied by any sufficient mechanism. A broken skip link on a page that "
        + "also has good landmarks may still pass the criterion; what this reports is that the mechanism "
        + "the author provided is not one.",
    ],
    accessibilitySupport: NVDA_EDGE + " Focus is read immediately after activation and before any command "
      + "that rewinds the caret — measured, because taking it later recorded the first link on the page "
      + "for every variant and made a working skip link indistinguishable from an inert one.",
  },
  {
    id: "a11y-witness:announced-control-keyboard-unreachable",
    version: "2026-08-22",
    name: "A control the page announces as operable that the keyboard never reaches",
    description: "The screen reader announces an interactive control, and Tab passed the point where it "
      + "sits without ever landing on it — so a keyboard user can hear the control and cannot operate it.",
    ruleType: "atomic",
    accessibilityRequirements: [{ criterion: "2.1.1", mapping: "secondary" }],
    inputAspects: ["structure.formFields", "interaction.focusOrder"],
    applicability: "Captures where the focus probe ran and the structural sweep found at least two "
      + "controls. Neither sequence alone supports a claim.",
    expectation: "Every announced control that precedes a control Tab DID reach is itself reached.",
    assumptions: [
      "POSITIONAL on purpose. The focus probe stops after a fixed number of Tab presses — measured, every "
        + "corpus page truncates at 12 stops — so absence from the tab order usually means the probe "
        + "stopped rather than that the control is unreachable. Only a control skipped while something "
        + "LATER was reached is evidence, which keeps the claim sound exactly where the evidence runs out.",
      "Names are compared after stripping the container the sweep announces before the first control in it "
        + "('form, Full name, edit' against 'Full name, edit, focused'). Without that the two channels "
        + "share no name for that control and the rule fires on a page where it was reached.",
      "A control the screen reader does not announce at all is out of scope: it is indistinguishable from "
        + "no control, and its absence is a 4.1.2 finding rather than this one.",
      "SECONDARY because 2.1.1 covers operation by any keyboard interface, and only Tab is pressed here. A "
        + "control reachable by arrow keys within a composite widget would be reported and should not be.",
    ],
    accessibilitySupport: NVDA_EDGE + " Tab is pressed through the screen reader, so what is recorded is "
      + "the reachability a screen-reader user experiences.",
  },
  {
    id: "a11y-witness:error-announced-without-remedy",
    version: "2026-09-02",
    name: "A validation error is announced but names only the problem",
    description: "A form submit is rejected and the screen reader announces an error — \"Visit date, edit, "
      + "invalid entry, Invalid entry.\" — that asserts something is wrong and never says what to do about "
      + "it. The conformant page announces the same rejection with an instruction: \"Enter the visit date "
      + "as DD slash MM slash YYYY.\" Both are announced, so this is not about silence.",
    ruleType: "atomic",
    accessibilityRequirements: [
      // SECONDARY since 2026-09-04, downgraded from `conformance` by the criterion audit — and the repo's
      // own test decides it rather than taste. CLAUDE.md: seven of the eleven rules-owned subtypes "map as
      // `secondary` and report `cantTell`, deliberately, BECAUSE THEY INFER THE FAILURE WHERE THE FOUR
      // READ IT DIRECTLY."
      //
      // This one infers. What it READS is "the announced error carries no instruction". What 3.3.3
      // FORBIDS is withholding a suggestion that is KNOWN, and only where doing so would not "jeopardize
      // the security or purpose of the content". Neither condition is in the announcement:
      //
      //   "Incorrect password"      — the security exception, and REQUIRED behaviour, not a failure
      //   "That username is taken"  — no correction exists to suggest, so none is owed
      //
      // The old comment said the instruction "is READ directly from the announcement, which is this
      // project's test for what a rule may state rather than refer". True of the instruction and false of
      // the FAILURE, and that conflation is what let it assert.
      //
      // Nothing else changes: it is still rules-owned for the measured reason (a head had recall 0.0 on
      // its own training data under both poolings, known-gaps.md §22), it still fires on the same
      // evidence, and the finding still reaches the report. It reaches it as `cantTell` — a moment worth
      // a human's attention — rather than as a conformance failure the criterion may not agree with.
      { criterion: "3.3.3", mapping: "secondary" },
    ],
    inputAspects: ["interaction.formChanges", "interaction.postSubmitFields"],
    applicability: "Every capture in which a control of kind `submit` was activated AND an error was "
      + "subsequently announced. A capture where nothing was submitted, or where nothing was announced, "
      + "is out of scope — the second of those is 3.3.1's finding.",
    expectation: "The announced error text contains an instruction the user can act on: a format, an "
      + "example, a range, or a required action.",
    assumptions: [
      "TWO NORMATIVE CONDITIONS IN THE CRITERION ARE NOT GUARDED HERE, found by the criterion audit on "
        + "2026-09-04. The criterion is 'If an input error is automatically detected AND SUGGESTIONS FOR "
        + "CORRECTION ARE KNOWN, then the suggestions are provided to the user, UNLESS IT WOULD JEOPARDIZE "
        + "THE SECURITY OR PURPOSE OF THE CONTENT.' This rule asserts on neither clause.",
      "SUGGESTIONS KNOWN. 'That username is taken' and 'This code has expired' have no correction to "
        + "suggest, and the criterion does not ask for one — so an error with no instruction can CONFORM. "
        + "Whether a suggestion is knowable is not readable from an announcement, which is an argument "
        + "that this mapping should be `secondary` rather than `conformance`. Recorded rather than acted "
        + "on: changing what the product ASSERTS is a decision, not a tidy-up.",
      "SECURITY OR PURPOSE. 'Incorrect password' withholding the reason is the canonical case, and it is "
        + "REQUIRED behaviour rather than a failure. This rule would assert 3.3.3 against every login "
        + "form it was pointed at. It cannot today -- `probeForms` is off in the CLI and real-page "
        + "captures -- but the GitHub Action defaults it ON, against the consumer's own application, "
        + "which is exactly where a login form is. The proposed guard is on the backlog: do not assert "
        + "where the re-read announces a password or protected field.",
      "An error that is not announced at all fails 3.3.1 and is deliberately NOT reported here. Asserting "
        + "both from one page would make every silent-validation case a 3.3.3 case too, which is the "
        + "mistake that once taught the 3.3.2 head about validation messages.",
      "A remedy is matched as an INSTRUCTION, never as a sentiment or a vocabulary of helpful-sounding "
        + "words. A wordlist here would be `vague_link_present` again — a feature answering a different "
        + "criterion's question, whose removal took 2.4.4 from 27 false positives to 0.",
      "No pattern depends on punctuation. NVDA speaks \"e.g.\" as \"e dot g.\" and \"DD/MM/YYYY\" as "
        + "\"DD slash MM slash YYYY\", so an alternative leaning on a symbol matches nothing while looking "
        + "like coverage. Measured; it cost a chain run.",
      "Cannot fire on a page we do not own. It reads probe-gated channels and `probeForms` is off for "
        + "real-page captures, because submitting a form on somebody else's site is not a review — so "
        + "`rules:real-pages` can only ever report zero findings for it, which is not validation.",
    ],
    accessibilitySupport: NVDA_EDGE + " The error text is taken from what the screen reader announced "
      + "after the submit, not from the DOM, so what is judged is what a screen-reader user actually hears.",
  },
  {
    id: "a11y-witness:context-change-without-action",
    version: "2026-09-02",
    name: "Focusing or typing into a control changes the page's context",
    description: "A control renames the page the moment it receives focus, or as the user types into it. "
      + "The screen reader reports one title before the interaction and a different one after — "
      + "\"Archive search\" becoming \"Results for 123456\" — so a user who meant to reach a field finds "
      + "themselves somewhere else, with no action they would recognise as navigation.",
    ruleType: "atomic",
    accessibilityRequirements: [
      // SECONDARY since 2026-09-04, downgraded from `conformance` by the criterion audit. The old comment
      // said the comparison "is READ, not judged: two titles are equal or they are not" — true, and it is
      // the wrong thing to have read. Two titles differing is READ; a CHANGE OF CONTEXT is inferred from
      // it, and the criterion says that inference does not hold:
      //
      //   "A change of content is not always a change of context. Changes in content, such as an
      //    expanding outline, dynamic menu, or a tab control do not necessarily change the context,
      //    unless they also change one of the above" — user agent, viewport, focus, or content that
      //    changes the MEANING of the web page.
      //
      // So a page appending a result count, or an SPA putting its active filter in the title, changes
      // CONTENT and conforms. This rule asserted a failure against it. The old comment even names the
      // distinction it fell on — "unlike every `secondary` mapping here, which INFERS a failure from
      // something adjacent to it" — which is exactly what a title difference is.
      { criterion: "3.2.1", mapping: "secondary" },
      { criterion: "3.2.2", mapping: "secondary" },
    ],
    inputAspects: ["interaction.focusContext", "interaction.typedFeedback"],
    applicability: "Every capture where the focus-context probe focused a control, or the typing probe "
      + "entered characters into one, AND the screen reader reported a page title both before and after. "
      + "A capture where neither happened is out of scope.",
    expectation: "The page reports the same title after the interaction as before it.",
    assumptions: [
      "A TITLE CHANGE IS NOT BY ITSELF A CHANGE OF CONTEXT, and this rule asserts as though it were. "
        + "The criterion's own note says so: 'A change of content is not always a change of context. "
        + "Changes in content, such as an expanding outline, dynamic menu, or a tab control do not "
        + "necessarily change the context, unless they also change one of the above' — user agent, "
        + "viewport, focus, or 'content that changes the MEANING of the web page'. So a page appending a "
        + "result count, or an SPA putting the active filter in its title, changes CONTENT and conforms; "
        + "this rule would assert a failure. Found by the criterion audit 2026-09-04 and on the backlog. "
        + "The rule's own example, \"Archive search\" becoming \"Results for 123456\", does change "
        + "meaning — which is why it looked sufficient.",
      "ATTRIBUTION IS ASSUMED, NOT ESTABLISHED. The probe focuses, then reads the title; a title that "
        + "moved for an unrelated asynchronous reason — a timer, a late-loading widget — is credited to "
        + "the focus. This repo guards exactly that elsewhere (`baselineQuiet` before a delta, "
        + "`probes.sameState` between channels) and this rule has no such guard.",
      "The TITLE is the part of 'change of context' a screen reader can observe. A context change that "
        + "leaves the title alone — a new window with the same name, a focus jump within one page — is "
        + "not witnessed here, so this covers one failure mode of several and `criterion-coverage.ts` "
        + "says which. Note the named one it misses: F55 is 'using script to remove focus when focus is "
        + "received', and FOCUS is itself one of the four things a change of context can be — so a "
        + "control that throws focus elsewhere fails 3.2.1 with the title untouched. `focusOrder` could "
        + "witness that and does not.",
      "A `null` title means the probe found nothing to focus or type into. Comparing two nulls would make "
        + "every such page conformant on a question nobody asked, so both reads must be strings before "
        + "anything is claimed.",
      "The title is read AFTER the interaction's speech settles. Reading it immediately races the page's "
        + "own navigation and returns the OLD title on a page that did change context — reporting "
        + "conformance for the failure.",
      "One helper decides both criteria because the evidence differs only in which probe produced it. "
        + "3.2.2 is 3.2.1 on change rather than on focus, which is how the coverage table has described "
        + "the pair since long before either was built.",
    ],
    accessibilitySupport: NVDA_EDGE + " The title is what NVDA reports on demand, so what is compared is "
      + "what a screen-reader user would hear if they asked where they were.",
  },
  {
    id: "a11y-witness:focus-reveal-not-dismissable",
    version: "2026-09-05",
    name: "Content revealed on focus is not dismissed by Escape",
    description: "Focusing a control makes additional content appear — a tooltip, a panel, a menu — and "
      + "pressing Escape afterwards does not make it go away, with focus never leaving the triggering "
      + "control. A screen-reader user who did not want the content has no way offered here to remove it "
      + "without moving away from the control that revealed it.",
    ruleType: "atomic",
    accessibilityRequirements: [
      // SECONDARY, argued rather than defaulted — this rule's evidence is a direct read of
      // `focusRevealVerdict`'s own verdict (three censuses and two focus reads), the same shape ADR 0021
      // moved `4.1.2:state-change-silent` to the rules for. It is NOT `conformance` because Dismissable's
      // own text carves out two exceptions this evidence cannot rule out — see `assumptions` below.
      { criterion: "1.4.13", mapping: "secondary" },
    ],
    inputAspects: ["interaction.focusReveal"],
    applicability: "Every capture where focusing a control was observed to grow the accessibility-tree "
      + "census (a formControl, link, graphic, heading or landmark that was not there before) AND the "
      + "focused control still held focus after Escape was pressed twice AND the census afterwards had "
      + "not shrunk back. A capture where the census could not be read, nothing was focusable, or nothing "
      + "appeared on focus is out of scope.",
    expectation: "Escape dismisses the content that appeared on focus, without moving focus away from the "
      + "control that revealed it.",
    assumptions: [
      "DISMISSABLE'S OWN TWO EXCEPTIONS ARE UNRULED-OUT BY THIS EVIDENCE. Verbatim: 'A mechanism is "
        + "available to dismiss the additional content ... unless the additional content communicates an "
        + "input error or does not obscure or replace other content.' Whether the revealed content is an "
        + "input-error message, and whether it obscures anything at all, are questions a census count "
        + "cannot answer — the second is pixels, which this evidence structurally cannot supply.",
      "PERSISTENT IS A DIFFERENT BULLET AND IS NOT DECIDED HERE. 'The additional content remains visible "
        + "until the hover or focus trigger is removed, the user dismisses it, or its information is no "
        + "longer valid' is a separate claim from Dismissable, and `focusRevealVerdict`'s own docstring "
        + "records that 'remains visible' is pixels and can never be confirmed from this evidence.",
      "HOVERABLE IS OUT OF SCOPE ENTIRELY. It is conditioned on 'if pointer hover can trigger the "
        + "additional content', and this tool never uses a pointer.",
      "THE PROBE WALKS AT MOST EIGHT TAB STOPS. A reveal on the ninth or later control is never observed, "
        + "so absence of a finding says nothing about a page beyond that budget — the same limit "
        + "`focusOrder`-based rules elsewhere in this file already carry.",
      "FOCUS MUST GENUINELY HOLD. If Escape moved focus rather than dismissing the content, the page never "
        + "demonstrated the mechanism the criterion asks about, and this rule makes no claim — reported "
        + "separately as `focusHeld: false`, never folded into the same verdict as a working dismissal.",
      "A CENSUS THAT COULD NOT BE READ IS 'CANNOT SAY', NEVER 'CONFORMS'. `structuralCensus` returns "
        + "`{ error }` rather than `null` on a dropped CDP socket, and `focusRevealVerdict` already refuses "
        + "to read that as a growth of zero — the same absence rule this file states for every other "
        + "rule reading a census or a probe result.",
    ],
    accessibilitySupport: NVDA_EDGE + " The census is the accessibility tree over the DevTools protocol, "
      + "not the screen reader, so what is counted is what an assistive-technology API would expose "
      + "regardless of which screen reader is listening.",
  },
  {
    id: "a11y-witness:focus-removed-by-script",
    version: "2026-09-06",
    name: "Script removes focus immediately after a control receives it",
    description: "A control receives focus and script strips it again within a window too short for a "
      + "human or a real focus round trip — Failure F55, 'using script to remove focus when focus is "
      + "received'. Nothing holds focus long enough for a visible focus indicator to have been shown, so "
      + "this fails the criterion by a chain of reasoning rather than by observing pixels.",
    ruleType: "atomic",
    accessibilityRequirements: [
      // SECONDARY, argued rather than defaulted, and the argument is in `rules.ts`'s own comment above
      // `addFocusEventFindings` and in `coverage.ts` at `RULE_CRITERIA`'s definition: a `focusin`/`focusout`
      // timing pair is evidence the MECHANISM is absent, never a read of whether an indicator was drawn.
      { criterion: "2.4.7", mapping: "secondary" },
    ],
    inputAspects: ["interaction.focusEvents"],
    applicability: "Every capture where `probeFocusOrder` installed the `focusin`/`focusout` log over CDP "
      + "and it ran to completion (`focusEvents.checked === true`). A capture where the oracle could not "
      + "run — no `focusin` listener installed, a dropped CDP socket, or the probe not requested — is out "
      + "of scope, reported as `checked: false` with a `why`, never read as zero findings.",
    expectation: "No control's `focusin` is followed by a same-id `focusout` inside "
      + "`FOCUS_SCRIPT_BLUR_WINDOW_MS` (50 ms) — the gap between a script's own `blur()` call and the "
      + "keystroke that gave it focus.",
    assumptions: [
      "THE LOWER BOUND IS UNCONFIRMED, AND SAYS SO AT THE THRESHOLD'S OWN DEFINITION. "
        + "`FOCUS_SCRIPT_BLUR_WINDOW_MS` in `capture-pure.mjs` carries two independent real-page "
        + "measurements of the NEGATIVE side — ordinary Tab transitions land at 1,944 ms/stop (a 38.9x "
        + "margin, an upper bound from a probe-wide mean) and, more directly, the smallest of 24 real "
        + "same-id `focusin`→`focusout` gaps measured 633 ms (a 12.6x margin). Neither touches the other "
        + "side: no capture has yet recorded a real script `blur()` to confirm one lands under 50 ms "
        + "rather than merely under 633. Until one does, this rule can correctly report a real F55 case "
        + "it is shown, but has not been proven to catch a borderline one.",
      "MATCHED BY ELEMENT ID, NEVER BY NAME OR POSITION. Two controls sharing a name must never be read "
        + "as one control losing focus it just received — `focusEventVerdict` pairs strictly on the CDP "
        + "element id the browser assigned, which is also what tells this failure apart from 2.1.1's: a "
        + "control that never received focus at all (no event) differs from one that received it and had "
        + "it stripped (a same-id pair), and only the event log — not the resulting tab-stop list — can "
        + "tell them apart.",
      "F78 IS A DIFFERENT FAILURE AND IS NOT DECIDED HERE. Styling a focus indicator away is a pixel "
        + "question this rule says nothing about either way; a clean report is silent on F78, never a "
        + "pass for 2.4.7 as a whole. See `criterion-coverage.ts`, which is `partial` for exactly this.",
      "AN EMPTY `scriptRemovedFocus` ON A `checked: true` LOG IS A REAL ZERO, NOT AN ABSENCE. The oracle "
        + "ran and found no script stripping focus, which is a different fact from never having asked — "
        + "`focusEventVerdict`'s own contract, and this rule reads `checked` before ever reading the array.",
    ],
    accessibilitySupport: NVDA_EDGE + " The event log is `focusin`/`focusout` over the DevTools protocol, "
      + "not the screen reader, so what is measured is when focus actually moved in the DOM rather than "
      + "when NVDA got around to announcing it.",
  },
];
