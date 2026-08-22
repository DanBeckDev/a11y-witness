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
    accessibilityRequirements: [{ criterion: "4.1.2", mapping: "conformance" }],
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
];
