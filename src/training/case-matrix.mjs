/**
 * Controlled page pairs for collecting screen-reader-only evidence.
 *
 * The page is an instrument: it creates a known contrast so the capture
 * pipeline can produce labels without putting HTML, DOM, CSS, or axe results
 * into the model input. The wording is original and the accessibility topics
 * are paraphrased from the repository's bookctx references and existing eval
 * fixtures.
 */

const BASE_STYLE = [
  "body { font: 16px system-ui, sans-serif; line-height: 1.5; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; }",
  "main { display: grid; gap: 1rem; }",
  "img { display: block; max-width: 100%; margin: 1rem 0; }",
  "label { display: block; margin-top: .75rem; }",
  "input, button, select { font: inherit; padding: .4rem; }",
  ".card { border: 1px solid #bbb; padding: 1rem; }",
  ".fake-heading { font-size: 1.4rem; font-weight: 700; margin-top: 1rem; }",
  ".error { color: #9b1c1c; margin-top: .5rem; }",
  "[hidden] { display: none; }",
].join("");

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function page({ title, heading, body, script = "", landmark = true }) {
  const content = "<h1>" + escapeHtml(heading) + "</h1>" + body;
  const container = landmark ? "<main>" + content + "</main>" : content;
  return "<!doctype html>\n"
    + "<html lang=\"en\">\n"
    + "<head><meta charset=\"utf-8\"><title>" + escapeHtml(title)
    + "</title><style>" + BASE_STYLE + "</style></head>\n"
    + "<body>" + container + "\n"
    + (script ? "<script>" + script + "</script>" : "")
    + "</body></html>";
}

function pair({
  id,
  criterion,
  task,
  source,
  mutation,
  badSignal,
  good,
  bad,
  probeForms = false,
  family = id,
}) {
  return { id, family, criterion, task, source, mutation, badSignal, probeForms, good, bad };
}

// What NVDA announces for an image it cannot name, across versions: older builds emit the
// object-replacement character (U+FFFC) as a stand-in for content they cannot describe, while
// NVDA 2026.1 emits its missing-description hint. Both mean the same thing -- the image has no
// usable alternative -- so a badSignal that matches only one form silently skips the case at
// export time, reported as "bad signal was not observable in NVDA output", which reads like
// the page is wrong rather than the pattern.
const UNNAMED_GRAPHIC = "(?:\\ufffc|to get missing image descriptions)";

// NVDA speaks a filename rather than spelling it: harbour_07-final.jpg is announced
// "harbour 07-final dot jpg". A pattern written from the filename therefore never matches
// what was actually said. Underscores become spaces and "." becomes " dot ".
function spokenForm(text) {
  return text.replaceAll("_", "[ _]").replaceAll(".", "(?:\\.| dot )");
}

const cases = [
  pair({
    id: "image-missing-alt",
    criterion: "1.1.1",
    task: "Read the project update and understand what the illustration shows.",
    source: "Practical Web Accessibility, chapter 22; Web Accessibility Cookbook, chapter 3",
    mutation: "The informative illustration has no alternative text.",
    badSignal: { type: "regex", pattern: "graphic[, ]+" + UNNAMED_GRAPHIC, flags: "i" },
    good: page({
      title: "Project update with an informative illustration",
      heading: "Project update",
      body: "<p>The garden project added a shaded seating area.</p><img src=\"/missing-garden.png\" alt=\"A shaded seating area beside the community garden\">",
    }),
    bad: page({
      title: "Project update with an unlabelled illustration",
      heading: "Project update",
      body: "<p>The garden project added a shaded seating area.</p><img src=\"/missing-garden.png\">",
    }),
  }),
  pair({
    id: "image-generic-alt",
    criterion: "1.1.1",
    task: "Read the project update and understand what the illustration shows.",
    source: "Practical Web Accessibility, chapter 22",
    mutation: "The illustration has a generic placeholder alternative such as image.",
    badSignal: { type: "regex", pattern: "graphic.*\\bimage\\b", flags: "i" },
    good: page({
      title: "Market report with a useful chart",
      heading: "Market report",
      body: "<p>Weekend visits increased after the new opening hours.</p><img src=\"/missing-chart.png\" alt=\"Line chart showing weekend visits rising from April to June\">",
    }),
    bad: page({
      title: "Market report with a placeholder chart label",
      heading: "Market report",
      body: "<p>Weekend visits increased after the new opening hours.</p><img src=\"/missing-chart.png\" alt=\"image\">",
    }),
  }),
  pair({
    id: "image-filename-alt",
    criterion: "1.1.1",
    task: "Find the image that identifies the new trail entrance.",
    source: "Practical Web Accessibility, chapter 22",
    mutation: "The alternative is a file name rather than a useful description.",
    badSignal: { type: "regex", pattern: "graphic.*trail[ _-]+entrance.*final", flags: "i" },
    good: page({
      title: "Trail map",
      heading: "Trail map",
      body: "<p>The new entrance is on the east side of the park.</p><img src=\"/trail_entrance-final.jpg\" alt=\"Map showing the new trail entrance on the east side of the park\">",
    }),
    bad: page({
      title: "Trail map",
      heading: "Trail map",
      body: "<p>The new entrance is on the east side of the park.</p><img src=\"/trail_entrance-final.jpg\" alt=\"trail_entrance-final.jpg\">",
    }),
  }),
  pair({
    id: "link-read-more",
    criterion: "2.4.4",
    task: "Open the guide for the Saturday workshop.",
    source: "Practical Web Accessibility, chapter 5; Web Accessibility Cookbook, chapter 22",
    mutation: "The link name is a repeated, context-poor phrase instead of the destination.",
    badSignal: { type: "regex", pattern: "link[, ]+(read more|learn more)\\b", flags: "i" },
    good: page({
      title: "Community workshops",
      heading: "Community workshops",
      body: "<p>Saturday workshop: planting for pollinators.</p><a href=\"/workshop-guide\">Read the planting for pollinators workshop guide</a>",
    }),
    bad: page({
      title: "Community workshops",
      heading: "Community workshops",
      body: "<p>Saturday workshop: planting for pollinators.</p><a href=\"/workshop-guide\">Read more</a>",
    }),
  }),
  pair({
    id: "link-click-here",
    criterion: "2.4.4",
    task: "Open the timetable for the evening class.",
    source: "Practical Web Accessibility, chapter 5",
    mutation: "The link name says how to operate it but not where it leads.",
    badSignal: { type: "regex", pattern: "link[, ]+click here\\b", flags: "i" },
    good: page({
      title: "Evening classes",
      heading: "Evening classes",
      body: "<p>The next class starts at six.</p><a href=\"/evening-timetable\">View the evening class timetable</a>",
    }),
    bad: page({
      title: "Evening classes",
      heading: "Evening classes",
      body: "<p>The next class starts at six.</p><a href=\"/evening-timetable\">Click here</a>",
    }),
  }),
  pair({
    id: "headings-fake",
    criterion: "1.3.1",
    task: "Navigate to the contact section and read its opening hours.",
    source: "Practical Web Accessibility, chapter 4; Web Accessibility Cookbook, chapter 22",
    mutation: "Visual section headings are styled text rather than heading elements.",
    badSignal: { type: "missing-heading", text: "Contact and opening hours" },
    good: page({
      title: "Library services",
      heading: "Library services",
      body: "<h2>Borrowing books</h2><p>Members may borrow six books.</p><h2>Contact and opening hours</h2><p>The desk is open until eight on weekdays.</p>",
    }),
    bad: page({
      title: "Library services",
      heading: "Library services",
      body: "<div class=\"fake-heading\">Borrowing books</div><p>Members may borrow six books.</p><div class=\"fake-heading\">Contact and opening hours</div><p>The desk is open until eight on weekdays.</p>",
    }),
  }),
  pair({
    id: "landmarks-missing",
    criterion: "1.3.1",
    task: "Jump to the main content and locate the support navigation.",
    source: "Web Accessibility Cookbook, chapter 22",
    mutation: "The page has visible regions but does not expose useful landmarks.",
    badSignal: { type: "structure-empty", field: "landmarks" },
    good: page({
      title: "Account help",
      heading: "Account help",
      body: "<nav aria-label=\"Support links\"><a href=\"/faq\">Frequently asked questions</a></nav><section aria-label=\"Main support article\"><h2>Resetting a password</h2><p>Choose a new password with at least twelve characters.</p></section>",
    }),
    bad: page({
      title: "Account help",
      heading: "Account help",
      body: "<div><a href=\"/faq\">Frequently asked questions</a></div><div><div class=\"fake-heading\">Resetting a password</div><p>Choose a new password with at least twelve characters.</p></div>",
      landmark: false,
    }),
  }),
  pair({
    id: "form-unlabelled",
    criterion: "3.3.2",
    task: "Enter the name of the person receiving the parcel.",
    source: "Practical Web Accessibility, chapter 6; Inclusive Design for Accessibility, chapter 13",
    mutation: "The text field has no programmatic label and relies on nearby visual text.",
    badSignal: { type: "unnamed-form-field" },
    good: page({
      title: "Parcel details",
      heading: "Parcel details",
      body: "<form><label for=\"recipient\">Recipient name</label><input id=\"recipient\" name=\"recipient\"></form>",
      script: "document.querySelector('input').focus();",
    }),
    bad: page({
      title: "Parcel details",
      heading: "Parcel details",
      body: "<form><span>Recipient name</span><input name=\"recipient\"></form>",
      script: "document.querySelector('input').focus();",
    }),
    probeForms: true,
  }),
  pair({
    id: "form-placeholder-only",
    criterion: "3.3.2",
    task: "Enter the email address for the booking confirmation.",
    source: "Practical Web Accessibility, chapter 6",
    mutation: "The only visible cue is a placeholder that disappears when typing starts.",
    badSignal: { type: "regex", pattern: "(?:edit text|edit)[, ]*(?:\\ufffc)?\\s*$", flags: "im" },
    // Deliberately NOT unnamed-form-field: a placeholder-only field is not unnamed, the
    // placeholder becomes its name. The discriminator is ORDER -- NVDA announces the bad page
    // as "<placeholder>, edit" (placeholder used as the name) and the good page as
    // "Confirmation email, edit, <placeholder>" (real label, placeholder as description), so
    // only the bad one ends on the role.
    good: page({
      title: "Booking confirmation",
      heading: "Booking confirmation",
      body: "<form><label for=\"email\">Confirmation email</label><input id=\"email\" type=\"email\" name=\"email\" placeholder=\"name@example.com\"></form>",
      script: "document.querySelector('input').focus();",
    }),
    bad: page({
      title: "Booking confirmation",
      heading: "Booking confirmation",
      body: "<form><input type=\"email\" name=\"email\" placeholder=\"name@example.com\"></form>",
      script: "document.querySelector('input').focus();",
    }),
    probeForms: true,
  }),
  pair({
    id: "custom-control-role",
    criterion: "4.1.2",
    task: "Save the notification settings.",
    source: "Practical Web Accessibility, chapter 6; Web Accessibility Cookbook, chapter 22",
    mutation: "A styled non-button element looks like a control but exposes no role or keyboard behavior.",
    badSignal: { type: "missing-role", text: "Save notification settings" },
    good: page({
      title: "Notification settings",
      heading: "Notification settings",
      body: "<button type=\"button\">Save notification settings</button>",
      script: "document.querySelector('button').focus();",
    }),
    bad: page({
      title: "Notification settings",
      heading: "Notification settings",
      body: "<div class=\"card\" id=\"save\">Save notification settings</div>",
      script: "document.querySelector('#save').focus();",
    }),
    probeForms: true,
  }),
  pair({
    id: "icon-button-unnamed",
    criterion: "4.1.2",
    task: "Open the account search.",
    source: "Practical Web Accessibility, chapter 6",
    mutation: "An icon-only button has no accessible name.",
    badSignal: { type: "regex", pattern: "(?:^|\\n)button[, ]*(?:$|\\n)", flags: "im" },
    good: page({
      title: "Account search",
      heading: "Account search",
      body: "<button type=\"button\" aria-label=\"Open account search\"><span aria-hidden=\"true\">⌕</span></button>",
      script: "document.querySelector('button').focus();",
    }),
    bad: page({
      title: "Account search",
      heading: "Account search",
      body: "<button type=\"button\"><span aria-hidden=\"true\">⌕</span></button>",
      script: "document.querySelector('button').focus();",
    }),
    probeForms: true,
  }),
  pair({
    id: "disclosure-state-silent",
    criterion: "4.1.2",
    task: "Open the travel advice to read the baggage rules.",
    source: "Web Accessibility Cookbook, chapter 22; Practical Web Accessibility, chapter 6",
    mutation: "Activating the disclosure changes visible content but does not update the announced state.",
    badSignal: { type: "state-change-silent", control: "Travel advice" },
    good: page({
      title: "Travel advice",
      heading: "Travel advice",
      body: "<button id=\"advice\" type=\"button\" aria-expanded=\"false\" aria-controls=\"rules\">Travel advice</button><div id=\"rules\" hidden>Small bags may be carried into the cabin.</div>",
      script: "document.querySelector('#advice').addEventListener('click', (event) => { const button = event.currentTarget; const open = button.getAttribute('aria-expanded') === 'true'; button.setAttribute('aria-expanded', String(!open)); document.querySelector('#rules').hidden = open; });",
    }),
    bad: page({
      title: "Travel advice",
      heading: "Travel advice",
      body: "<button id=\"advice\" type=\"button\" aria-expanded=\"false\" aria-controls=\"rules\">Travel advice</button><div id=\"rules\" hidden>Small bags may be carried into the cabin.</div>",
      script: "document.querySelector('#advice').addEventListener('click', () => { document.querySelector('#rules').hidden = false; });",
    }),
    probeForms: true,
  }),
  pair({
    id: "form-error-silent",
    criterion: "3.3.1",
    task: "Submit the request without entering a reference number and understand what needs fixing.",
    source: "Web Accessibility Cookbook, chapter 22; Practical Web Accessibility, chapter 6",
    mutation: "A validation message appears visually but is not associated with the invalid field or announced as a live update.",
    badSignal: { type: "validation-error-silent", control: "Submit request" },
    good: page({
      title: "Service request",
      heading: "Service request",
      body: "<form id=\"request\"><label for=\"reference\">Reference number</label><input id=\"reference\" aria-describedby=\"reference-error\"><button type=\"submit\">Submit request</button><p id=\"reference-error\" role=\"alert\" hidden>Enter the reference number before submitting.</p></form>",
      script: "document.querySelector('#request').addEventListener('submit', (event) => { event.preventDefault(); const input = document.querySelector('#reference'); input.setAttribute('aria-invalid', 'true'); document.querySelector('#reference-error').hidden = false; input.focus(); });",
    }),
    bad: page({
      title: "Service request",
      heading: "Service request",
      body: "<form id=\"request\"><span>Reference number</span><input id=\"reference\"><button type=\"submit\">Submit request</button><p class=\"error\" hidden>Enter the reference number before submitting.</p></form>",
      script: "document.querySelector('#request').addEventListener('submit', (event) => { event.preventDefault(); document.querySelector('.error').hidden = false; });",
    }),
    probeForms: true,
  }),
  pair({
    id: "filter-status-silent",
    criterion: "4.1.3",
    task: "Filter the catalogue to show only bags and notice how many results remain.",
    source: "Web Accessibility Cookbook, chapter 22; Practical Web Accessibility, chapter 6",
    mutation: "Filtering updates the visible result count but does not expose the update through a live status.",
    badSignal: { type: "form-activation-silent", control: "Show bags" },
    good: page({
      title: "Product catalogue",
      heading: "Product catalogue",
      body: "<button id=\"bags\" type=\"button\">Show bags</button><p id=\"count\" role=\"status\">Showing 8 products.</p><ul id=\"products\"><li>Canvas bag</li><li>Travel bag</li></ul>",
      script: "document.querySelector('#bags').addEventListener('click', () => { document.querySelector('#count').textContent = 'Showing 2 bags.'; });",
    }),
    bad: page({
      title: "Product catalogue",
      heading: "Product catalogue",
      body: "<button id=\"bags\" type=\"button\">Show bags</button><p id=\"count\">Showing 8 products.</p><ul id=\"products\"><li>Canvas bag</li><li>Travel bag</li></ul>",
      script: "document.querySelector('#bags').addEventListener('click', () => { document.querySelector('#count').textContent = 'Showing 2 bags.'; });",
    }),
    probeForms: true,
  }),
  pair({
    id: "table-unassociated-headers",
    criterion: "1.3.1",
    task: "Compare the departure time and platform for Riverside.",
    source: "Web Accessibility Cookbook, chapter 22; existing table eval fixtures",
    mutation: "A data table uses visual header cells without exposing their relationships to each data cell.",
    badSignal: { type: "table-unassociated" },
    good: page({
      title: "Train departures",
      heading: "Train departures",
      body: "<table><caption>Departures from Central station</caption><thead><tr><th scope=\"col\">Destination</th><th scope=\"col\">Departs</th><th scope=\"col\">Platform</th></tr></thead><tbody><tr><th scope=\"row\">Riverside</th><td>09:15</td><td>3</td></tr><tr><th scope=\"row\">Hilltown</th><td>09:40</td><td>5</td></tr></tbody></table>",
    }),
    bad: page({
      title: "Train departures",
      heading: "Train departures",
      body: "<table><caption>Departures from Central station</caption><tr><td>Destination</td><td>Departs</td><td>Platform</td></tr><tr><td>Riverside</td><td>09:15</td><td>3</td></tr><tr><td>Hilltown</td><td>09:40</td><td>5</td></tr></table>",
    }),
  }),
];

function imageVariant({ id, title, heading, description, file, goodAlt, badAlt, task }) {
  const goodImage = "<img src=\"/" + file + "\" alt=\"" + goodAlt + "\">";
  const badImage = "<img src=\"/" + file + "\""
    + (badAlt === null ? "" : " alt=\"" + badAlt + "\"") + ">";
  return pair({
    id,
    family: "image-alternative",
    criterion: "1.1.1",
    task,
    source: "Practical Web Accessibility, chapter 22",
    mutation: "The informative image loses a useful alternative and is announced without its meaning.",
    badSignal: {
      type: "regex",
      pattern: "graphic.*" + (badAlt === null ? UNNAMED_GRAPHIC : spokenForm(badAlt)),
      flags: "i",
    },
    good: page({ title, heading, body: "<p>" + description + "</p>" + goodImage }),
    bad: page({ title, heading, body: "<p>" + description + "</p>" + badImage }),
  });
}

function linkVariant({ id, title, heading, context, vague, descriptive, task }) {
  return pair({
    id,
    family: "link-purpose",
    criterion: "2.4.4",
    task,
    source: "Practical Web Accessibility, chapter 5; Web Accessibility Cookbook, chapter 22",
    mutation: "The link name is a short context-poor phrase rather than the destination.",
    badSignal: { type: "regex", pattern: "link[, ]+" + vague + "\\b", flags: "i" },
    good: page({
      title,
      heading,
      body: "<p>" + context + "</p><a href=\"/destination\">" + descriptive + "</a>",
    }),
    bad: page({
      title,
      heading,
      body: "<p>" + context + "</p><a href=\"/destination\">" + vague + "</a>",
    }),
  });
}

function vagueHeadingVariant({ id, title, heading, vague, descriptive, task }) {
  return pair({
    id,
    family: "heading-purpose",
    criterion: "2.4.6",
    task,
    source: "Practical Web Accessibility, chapter 4; Web Accessibility Cookbook, chapter 22",
    mutation: "A real heading role is present, but its name does not identify the topic.",
    badSignal: { type: "regex", pattern: "heading.*\\b" + vague.toLowerCase() + "\\b", flags: "i" },
    good: page({
      title,
      heading,
      body: "<h2>" + descriptive + "</h2><p>The section explains the next step.</p>",
    }),
    bad: page({
      title,
      heading,
      body: "<h2>" + vague + "</h2><p>The section explains the next step.</p>",
    }),
  });
}

function landmarkVariant({ id, title, heading, label, text, task }) {
  return pair({
    id,
    family: "landmark-navigation",
    criterion: "1.3.1",
    task,
    source: "Web Accessibility Cookbook, chapter 22",
    mutation: "A visible page region is not exposed as a landmark.",
    badSignal: { type: "structure-empty", field: "landmarks" },
    good: page({
      title,
      heading,
      body: "<section aria-label=\"" + label + "\"><h2>" + label + "</h2><p>" + text + "</p></section>",
    }),
    bad: page({
      title,
      heading,
      body: "<div><h2>" + label + "</h2><p>" + text + "</p></div>",
      landmark: false,
    }),
  });
}

function unlabelledFieldVariant({ id, title, heading, label, name, task }) {
  return pair({
    id,
    family: "form-labels",
    criterion: "3.3.2",
    task,
    source: "Practical Web Accessibility, chapter 6; Inclusive Design for Accessibility, chapter 13",
    mutation: "The field has nearby visible text but no programmatic label.",
    badSignal: { type: "unnamed-form-field" },
    good: page({
      title,
      heading,
      body: "<form><label for=\"" + name + "\">" + label + "</label><input id=\"" + name + "\" name=\"" + name + "\"></form>",
      script: "document.querySelector('input').focus();",
    }),
    bad: page({
      title,
      heading,
      body: "<form><span>" + label + "</span><input name=\"" + name + "\"></form>",
      script: "document.querySelector('input').focus();",
    }),
    probeForms: true,
  });
}

function customControlVariant({ id, title, heading, label, task }) {
  return pair({
    id,
    family: "control-name-role",
    criterion: "4.1.2",
    task,
    source: "Practical Web Accessibility, chapter 6; Web Accessibility Cookbook, chapter 22",
    mutation: "A styled text element looks like a button but has no exposed role.",
    badSignal: { type: "missing-role", text: label },
    good: page({
      title,
      heading,
      body: "<button type=\"button\">" + label + "</button>",
      script: "document.querySelector('button').focus();",
    }),
    bad: page({
      title,
      heading,
      body: "<div class=\"card\">" + label + "</div>",
    }),
    probeForms: true,
  });
}

function unnamedIconVariant({ id, title, heading, name, task }) {
  return pair({
    id,
    family: "control-name-role",
    criterion: "4.1.2",
    task,
    source: "Practical Web Accessibility, chapter 6",
    mutation: "An icon-only button has no accessible name.",
    // NVDA announces an unnamed control EITHER as "button, <U+FFFC>" or as a bare "button",
    // and it varies between runs of the same page -- observed both ways across two full
    // capture runs. Match both: keying a signal on one observed string is how these went
    // blind in the first place.
    badSignal: {
      type: "regex",
      pattern: "(?:^|\\n)button[, ]*(?:" + UNNAMED_GRAPHIC + ")?[, ]*(?:$|\\n)",
      flags: "im",
    },
    good: page({
      title,
      heading,
      body: "<button type=\"button\" aria-label=\"" + name + "\"><span aria-hidden=\"true\">⌕</span></button>",
      script: "document.querySelector('button').focus();",
    }),
    bad: page({
      title,
      heading,
      body: "<button type=\"button\"><span aria-hidden=\"true\">⌕</span></button>",
      script: "document.querySelector('button').focus();",
    }),
    probeForms: true,
  });
}

function disclosureVariant({ id, title, heading, control, content, task }) {
  const goodScript = "document.querySelector('#toggle').addEventListener('click', (event) => { const button = event.currentTarget; const open = button.getAttribute('aria-expanded') === 'true'; button.setAttribute('aria-expanded', String(!open)); document.querySelector('#content').hidden = open; });";
  const badScript = "document.querySelector('#toggle').addEventListener('click', () => { document.querySelector('#content').hidden = false; });";
  const body = "<button id=\"toggle\" type=\"button\" aria-expanded=\"false\" aria-controls=\"content\">"
    + control + "</button><div id=\"content\" hidden>" + content + "</div>";
  return pair({
    id,
    family: "dynamic-state",
    criterion: "4.1.2",
    task,
    source: "Web Accessibility Cookbook, chapter 22; Practical Web Accessibility, chapter 6",
    mutation: "Activation changes visible content without updating the announced expanded state.",
    badSignal: { type: "state-change-silent", control },
    good: page({ title, heading, body, script: goodScript }),
    bad: page({ title, heading, body, script: badScript }),
    probeForms: true,
  });
}

function errorVariant({ id, title, heading, field, submit, message, task }) {
  const goodBody = "<form id=\"form\"><label for=\"field\">" + field + "</label><input id=\"field\" aria-describedby=\"error\"><button type=\"submit\">" + submit + "</button><p id=\"error\" role=\"alert\" hidden>" + message + "</p></form>";
  const badBody = "<form id=\"form\"><span>" + field + "</span><input id=\"field\"><button type=\"submit\">" + submit + "</button><p class=\"error\" hidden>" + message + "</p></form>";
  const goodScript = "document.querySelector('#form').addEventListener('submit', (event) => { event.preventDefault(); document.querySelector('#field').setAttribute('aria-invalid', 'true'); document.querySelector('#error').hidden = false; document.querySelector('#field').focus(); });";
  const badScript = "document.querySelector('#form').addEventListener('submit', (event) => { event.preventDefault(); document.querySelector('.error').hidden = false; });";
  return pair({
    id,
    family: "dynamic-feedback",
    criterion: "3.3.1",
    task,
    source: "Web Accessibility Cookbook, chapter 22; Practical Web Accessibility, chapter 6",
    mutation: "A validation message appears visually but is not associated with the invalid field or announced.",
    badSignal: { type: "validation-error-silent", control: submit },
    good: page({ title, heading, body: goodBody, script: goodScript }),
    bad: page({ title, heading, body: badBody, script: badScript }),
    probeForms: true,
  });
}

function statusVariant({ id, title, heading, control, task }) {
  const body = "<button id=\"filter\" type=\"button\">" + control + "</button><p id=\"count\">Showing 8 items.</p><ul><li>First item</li><li>Second item</li></ul>";
  const goodBody = body.replace("id=\"count\"", "id=\"count\" role=\"status\"");
  const script = "document.querySelector('#filter').addEventListener('click', () => { document.querySelector('#count').textContent = 'Showing 2 matching items.'; });";
  return pair({
    id,
    family: "dynamic-feedback",
    criterion: "4.1.3",
    task,
    source: "Web Accessibility Cookbook, chapter 22; Practical Web Accessibility, chapter 6",
    mutation: "A result count changes without a live status announcement.",
    badSignal: { type: "form-activation-silent", control },
    good: page({ title, heading, body: goodBody, script }),
    bad: page({ title, heading, body, script }),
    probeForms: true,
  });
}

function tableVariant({ id, title, heading, destination, task }) {
  const good = "<table><caption>Departures from Central station</caption><thead><tr><th scope=\"col\">Destination</th><th scope=\"col\">Departs</th><th scope=\"col\">Platform</th></tr></thead><tbody><tr><th scope=\"row\">" + destination + "</th><td>09:15</td><td>3</td></tr></tbody></table>";
  const bad = "<table><caption>Departures from Central station</caption><tr><td>Destination</td><td>Departs</td><td>Platform</td></tr><tr><td>" + destination + "</td><td>09:15</td><td>3</td></tr></table>";
  return pair({
    id,
    family: "table-relationships",
    criterion: "1.3.1",
    task,
    source: "Web Accessibility Cookbook, chapter 22; existing table eval fixtures",
    mutation: "Visual table headers are not associated with their data cells.",
    badSignal: { type: "table-unassociated" },
    good: page({ title, heading, body: good }),
    bad: page({ title, heading, body: bad }),
  });
}

const generatedCases = [
  imageVariant({ id: "image-missing-alt-map", title: "Park map", heading: "Park map", description: "The east entrance is beside the lake.", file: "park-map.png", goodAlt: "Map showing the east entrance beside the lake", badAlt: null, task: "Find the east entrance on the park map." }),
  imageVariant({ id: "image-missing-alt-building", title: "Civic centre", heading: "Civic centre", description: "The restored building opens on Monday.", file: "civic-centre.png", goodAlt: "Front entrance of the restored civic centre", badAlt: null, task: "Understand what the civic centre image shows." }),
  imageVariant({ id: "image-generic-alt-recipe", title: "Recipe guide", heading: "Recipe guide", description: "The final dish is ready to serve.", file: "finished-dish.png", goodAlt: "Bowl of vegetable soup with herbs on top", badAlt: "image", task: "Understand what the finished dish looks like." }),
  imageVariant({ id: "image-filename-alt-exhibit", title: "Museum exhibit", heading: "Museum exhibit", description: "The exhibit explains how the harbour changed.", file: "harbour_07-final.jpg", goodAlt: "Historic photograph of the harbour before the new bridge", badAlt: "harbour_07-final.jpg", task: "Read the description of the harbour exhibit." }),
  linkVariant({ id: "link-vague-details", title: "Course catalogue", heading: "Course catalogue", context: "The evening drawing course begins next month.", vague: "Details", descriptive: "View the evening drawing course details", task: "Open the evening drawing course details." }),
  linkVariant({ id: "link-vague-here", title: "Travel information", heading: "Travel information", context: "The station has step-free access.", vague: "Here", descriptive: "Read the station step-free access information", task: "Read the station step-free access information." }),
  linkVariant({ id: "link-vague-more", title: "Volunteer roles", heading: "Volunteer roles", context: "The archive needs help cataloguing photographs.", vague: "More", descriptive: "Learn more about archive cataloguing volunteer roles", task: "Learn about archive cataloguing volunteer roles." }),
  linkVariant({ id: "link-vague-go", title: "Account options", heading: "Account options", context: "Choose the option for changing a password.", vague: "Go", descriptive: "Open the change password instructions", task: "Open the change password instructions." }),
  vagueHeadingVariant({ id: "headings-vague-welcome", title: "Museum guide", heading: "Museum guide", vague: "Welcome", descriptive: "Permanent collection highlights", task: "Navigate to the permanent collection highlights." }),
  vagueHeadingVariant({ id: "headings-vague-stuff", title: "Repair service", heading: "Repair service", vague: "Stuff", descriptive: "What to bring to your appointment", task: "Find what to bring to the repair appointment." }),
  vagueHeadingVariant({ id: "headings-vague-things", title: "School trip", heading: "School trip", vague: "Things", descriptive: "Information for visiting school groups", task: "Find information for visiting school groups." }),
  landmarkVariant({ id: "landmarks-missing-news", title: "Town news", heading: "Town news", label: "Latest news", text: "The council approved a new playground.", task: "Jump to the latest news." }),
  landmarkVariant({ id: "landmarks-missing-help", title: "Help centre", heading: "Help centre", label: "Account help", text: "You can change your sign-in details here.", task: "Jump to account help." }),
  landmarkVariant({ id: "landmarks-missing-events", title: "Events calendar", heading: "Events calendar", label: "Upcoming events", text: "The next event is on Saturday.", task: "Jump to upcoming events." }),
  unlabelledFieldVariant({ id: "form-unlabelled-address", title: "Delivery address", heading: "Delivery address", label: "Street address", name: "street", task: "Enter the street address for delivery." }),
  unlabelledFieldVariant({ id: "form-unlabelled-phone", title: "Contact details", heading: "Contact details", label: "Telephone number", name: "phone", task: "Enter the telephone number for contact." }),
  unlabelledFieldVariant({ id: "form-unlabelled-reference", title: "Support request", heading: "Support request", label: "Case reference", name: "case", task: "Enter the case reference for support." }),
  customControlVariant({ id: "custom-control-archive", title: "Archive", heading: "Archive", label: "Archive selected messages", task: "Archive the selected messages." }),
  customControlVariant({ id: "custom-control-print", title: "Report", heading: "Report", label: "Print this report", task: "Print this report." }),
  customControlVariant({ id: "custom-control-refresh", title: "Dashboard", heading: "Dashboard", label: "Refresh dashboard", task: "Refresh the dashboard." }),
  unnamedIconVariant({ id: "icon-button-unnamed-menu", title: "Project menu", heading: "Project menu", name: "Open project menu", task: "Open the project menu." }),
  unnamedIconVariant({ id: "icon-button-unnamed-help", title: "Help options", heading: "Help options", name: "Open help options", task: "Open help options." }),
  disclosureVariant({ id: "disclosure-state-silent-parking", title: "Parking advice", heading: "Parking advice", control: "Parking rules", content: "Visitors may park for two hours.", task: "Open the parking rules." }),
  disclosureVariant({ id: "disclosure-state-silent-refunds", title: "Refund policy", heading: "Refund policy", control: "Refund details", content: "Refunds are processed within five working days.", task: "Open the refund details." }),
  errorVariant({ id: "form-error-silent-email", title: "Newsletter signup", heading: "Newsletter signup", field: "Email address", submit: "Join newsletter", message: "Enter an email address before joining.", task: "Submit the newsletter form without an email address." }),
  errorVariant({ id: "form-error-silent-postcode", title: "Parcel booking", heading: "Parcel booking", field: "Postcode", submit: "Book parcel", message: "Enter the postcode before booking.", task: "Submit the parcel booking without a postcode." }),
  statusVariant({ id: "filter-status-silent-colours", title: "Clothing catalogue", heading: "Clothing catalogue", control: "Show blue items", task: "Show blue items and notice the result count." }),
  statusVariant({ id: "filter-status-silent-prices", title: "Book catalogue", heading: "Book catalogue", control: "Show books under ten pounds", task: "Show books under ten pounds and notice the result count." }),
  tableVariant({ id: "table-unassociated-hilltown", title: "Train timetable", heading: "Train timetable", destination: "Hilltown", task: "Compare the departure time and platform for Hilltown." }),
  tableVariant({ id: "table-unassociated-lakeside", title: "Train timetable", heading: "Train timetable", destination: "Lakeside", task: "Compare the departure time and platform for Lakeside." }),
];

cases.push(...generatedCases);

export const CASES = Object.freeze(cases);

function structuralTextParts(capture) {
  return [
    ...(capture.structure?.headings || []),
    ...(capture.structure?.landmarks || []),
    ...(capture.structure?.formFields || []),
  ];
}

function interactionTextParts(capture) {
  return [
    ...(capture.interaction?.controls || []),
    ...(capture.interaction?.stateChanges || []).flatMap(({ control, after }) => [control, after]),
    ...(capture.interaction?.formChanges || []).flatMap(({ control, after }) => [control, after]),
    ...(capture.interaction?.postSubmitFields || []),
  ];
}

function captureTextParts(capture) {
  return [
    ...(capture.transcript || []),
    ...structuralTextParts(capture),
    ...interactionTextParts(capture),
  ];
}

function flattenCapture(capture) {
  return captureTextParts(capture).filter((value) => typeof value === "string").join("\n");
}

function regexMatches(capture, signal) {
  return new RegExp(signal.pattern, signal.flags || "i").test(flattenCapture(capture));
}

function structureIsEmpty(capture, signal) {
  return (capture.structure?.[signal.field] || []).length === 0;
}

function headingIsMissing(capture, signal) {
  return !(capture.structure?.headings || []).some((heading) => heading.toLowerCase().includes(signal.text.toLowerCase()));
}

function hasMissingRole(capture, signal) {
  const values = [
    ...(capture.transcript || []),
    ...(capture.structure?.formFields || []),
    ...(capture.interaction?.controls || []),
  ];
  return values.some((value) => value.toLowerCase().includes(signal.text.toLowerCase())
    && !/button|link|checkbox|radio|menu|switch|heading/i.test(value));
}

const STATE_WORD = /\b(expanded|collapsed|open|closed|pressed|checked)\b/i;

const stateWordOf = (text) => (text.match(STATE_WORD)?.[1] ?? "").toLowerCase();

// The disclosure failure is "operating the control did not change the announced state".
//
// This used to test whether the announcement was EMPTY, which was right when the probe
// listened for a spontaneous announcement. The probe now re-reads the control after
// activating it, so `after` always carries a state word and the emptiness test could never
// fire again -- it silently stopped discriminating and took three cases with it. A probe and
// its signal are coupled; changing one means revisiting the other.
function stateChangeIsSilent(capture, signal) {
  const changes = capture.interaction?.stateChanges || [];
  return changes.some(({ control, after }) => {
    if (!control.toLowerCase().includes(signal.control.toLowerCase())) return false;
    const before = stateWordOf(control);
    const now = stateWordOf(after);
    // No state word at all is still a failure: nothing was conveyed either way.
    return now === "" || now === before;
  });
}

// Two failures that both involve activating a control, but whose evidence lives in
// different channels. Conflating them cost three cases: a single matcher tuned for one
// reported the other's GOOD page as failing.
//
// (a) 4.1.3 Status Messages -- a filter updates results and says nothing. The status IS the
// announcement, so it lands in `formChanges.after`: the good page carries "Showing 2 bags.",
// the bad page carries "".
function formActivationIsSilent(capture, signal) {
  const changes = capture.interaction?.formChanges || [];
  const target = changes.filter(({ control }) => control.toLowerCase().includes(signal.control.toLowerCase()));
  return target.length === 0 || target.every(({ after }) => after.trim() === "");
}

// An announced validation error leaves a durable trace on the field: NVDA reports
// "invalid entry" for aria-invalid, plus the message via the field's description.
const ANNOUNCED_ERROR = /invalid|\berror\b/i;

// (b) 3.3.1 Error Identification -- submitting bad input announces no error. Here
// `formChanges.after` is useless: it records the focus move after submit and reads
// "Newsletter signup, document" on BOTH pages. The evidence is in `postSubmitFields`, the
// deliberate re-read of durable field state -- persistent state over transient speech, which
// is the lesson the NVDA correctness audit already drew (its Root 2).
function validationErrorIsSilent(capture, signal) {
  const submitted = (capture.interaction?.formChanges || [])
    .some(({ control }) => control.toLowerCase().includes(signal.control.toLowerCase()));
  if (!submitted) return true; // the submit never happened, so nothing could be announced
  return !(capture.interaction?.postSubmitFields || []).some((field) => ANNOUNCED_ERROR.test(field));
}

// A data cell in a properly-marked-up table is announced with its header
// ("row 2, Destination, column 1, Riverside"); without header association NVDA can only
// announce the position ("row 2, column 1, Riverside"). So the failure is a data row whose
// "row N" runs straight into "column".
//
// The previous version could never match ANY input: written as a regex literal, `\\s` is an
// escaped backslash followed by "s", not whitespace. It also keyed on the literal time
// "09:15", so it would not have generalised to the other two pages even once fixed.
// Excludes row 1: that is the header row, which announces "row 1, column 1" on a correct
// table too. Only DATA rows should carry their header names.
const POSITION_ONLY_CELL = /row\s+(?!1\b)\d+[, ]+column/i;

function tableHeadersAreUnassociated(capture) {
  return POSITION_ONLY_CELL.test(flattenCapture(capture));
}

// A form field NVDA announces as a bare role, with no name in front of it: "edit" rather
// than "Recipient name, edit".
//
// This replaces a transcript regex for a trailing "edit", which fired on the GOOD page too
// and so discriminated nothing -- NVDA announces a correctly labelled field across two
// lines, the label then the role, leaving a line that is only "edit". The structural
// form-field sweep does not have that ambiguity: the name and role arrive together.
// Same rule as the 4.1.2 check in src/spike/rules.ts.
const LEADING_ROLE = /^(edit(\s+text)?|button|checkbox|radio|combo\s*box|list\s*box|slider|spin\s*button)\b/i;

function hasUnnamedFormField(capture) {
  return (capture.structure?.formFields || []).some((field) => LEADING_ROLE.test(field.trim()));
}

export function signalMatches(capture, signal) {
  if (signal.type === "unnamed-form-field") return hasUnnamedFormField(capture);
  if (signal.type === "regex") return regexMatches(capture, signal);
  if (signal.type === "structure-empty") return structureIsEmpty(capture, signal);
  if (signal.type === "missing-heading") return headingIsMissing(capture, signal);
  if (signal.type === "missing-role") return hasMissingRole(capture, signal);
  if (signal.type === "state-change-silent") return stateChangeIsSilent(capture, signal);
  if (signal.type === "form-activation-silent") return formActivationIsSilent(capture, signal);
  if (signal.type === "validation-error-silent") return validationErrorIsSilent(capture, signal);
  if (signal.type === "table-unassociated") return tableHeadersAreUnassociated(capture);
  return false;
}

function appendTextUnits(units, channel, values) {
  for (const text of values || []) {
    if (typeof text === "string" && text.length > 0) units.push({ channel, text });
  }
}

function appendChangeUnits(units, channel, changes) {
  for (const { control, after } of changes || []) {
    const text = control + " -> " + after;
    if (text.length > 0) units.push({ channel, text });
  }
}

export function evidenceUnits(capture) {
  const units = [];
  appendTextUnits(units, "transcript", capture.transcript);
  appendTextUnits(units, "heading-navigation", capture.structure?.headings);
  appendTextUnits(units, "landmark-navigation", capture.structure?.landmarks);
  appendTextUnits(units, "form-navigation", capture.structure?.formFields);
  appendTextUnits(units, "control-navigation", capture.interaction?.controls);
  appendChangeUnits(units, "state-change", capture.interaction?.stateChanges);
  appendChangeUnits(units, "form-change", capture.interaction?.formChanges);
  appendTextUnits(units, "post-submit-navigation", capture.interaction?.postSubmitFields);
  return units;
}

export function captureEvidenceText(capture) {
  return evidenceUnits(capture).map(({ text }) => text).join("\n");
}
