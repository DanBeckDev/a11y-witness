/**
 * #1514: 2.4.3 READS THE RECORDED TAB WALK AS A CYCLE, rotated to where Tab enters the document.
 *
 * `firstVisitEach` reads the walk as a line from its first stop. On `ico.org.uk/action-weve-taken/enforcement/`
 * (2026-09-14, #1043 5658126858) the walk began at "Skip to main content", left the page through the browser's own
 * controls, and re-entered at "Cookie options", the page's first control in Tab order. The line reading made it last,
 * and 2.4.3 reported "reads as [Cookie options, Search, ...] but tabs as [Search, ..., Cookie options]".
 *
 * The address bar is the document-entry marker. Without it, "first in reading order, last in the walk" cannot be told
 * apart from a control genuinely last in Tab order, so a walk with no marker must still fire (the three baselined
 * 2.4.3 pages have that shape, and #1514's sweep decides them from a marker, never from the moved-control signature).
 *
 * Announcement strings are quoted from real captures: the ico enforcement capture (#1043) and rehearsal 2's
 * `a11ign-result.json` (run 34767932873, the strings `packages/evidence/src/left-site.test.ts` uses).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leftSite, type SiteBoundCapture } from "@a11ign/evidence";
import { addressBarHost, fromDocumentEntry } from "./channel-comparison.js";
import { ruleFindings } from "./rules.js";

// Rehearsal 2 (run 34767932873), verbatim.
const EMBED = "main landmark, Web Accessibility Perspectives: Video Captions, region, Video, frame, clickable, "
  + "thumbnail-image, graphic, button";
const YOUTUBE_TAB = "W 3C Web Accessibility Initiative (WAI) - You Tube - Memory usage - 293 MB, tab, focused, "
  + "selected, youtube dot com, 1 of 1";
const REHEARSAL_ADDRESS_BAR = "Address and search bar, search landmark, focused, collapsed, Search or enter web "
  + "address, Ctrl plus, L, selected https: slash slash www dot youtube dot com slash channel slash UCU 6ljj 3m 1fgl I "
  + "Pj Sjs 2Dp RA";

// The ico enforcement capture (#1043 5658098136 and 5658140291), verbatim.
const ICO_ADDRESS_BAR = "Address and search bar, search landmark, focused, collapsed, Search or enter web address, "
  + "Ctrl plus, L, selected https: slash slash ico dot org dot uk slash action-weve-taken slash enforcement slash";
const TRANSCRIPT = [
  "button, collapsed, Cookie options",
  "out of region, visited, same page, link, Skip to main content",
  "button, Search",
  "button, Menu",
];
const SKIP = "Skip to main content , link, focused, visited, linked, same page";
const COOKIE = "Cookie options, button, focused, collapsed";
const SEARCH = "Search, button, focused";
const MENU = "Menu, button, focused";
const BROWSER_UI = ["Search tabs, button, focused, collapsed", "Back, button, focused, Press to go back (Alt plus Left "
  + "arrow), or open context menu to see history", "Settings and more (Alt plus F), button, focused"];

// The ico enforcement capture in full (sha256 1a8d483f61d52aa1e1429ef4a00da0d79b42528ed978115dfd9a4431f4383975), as
// orchestrator posted it verbatim on #1514 (5661722801): all 100 `interaction.focusOrder` stops, all 69 transcript
// lines, and the `heard` of each `truncatedAnnouncements` mark, which is what `truncatedAnnouncements()` passes on.
const ICO_WALK = [
  "Skip to main content , link, focused, visited, linked, same page",
  "Home, link, focused, linked",
  " Cymraeg, link, focused, linked",
  " Search, button, focused",
  " Menu, button, focused",
  "Action we've taken, link, focused, linked",
  "Keywords, edit, focused, off screen, blank",
  "Clear, button, focused, off screen",
  "Enforcement notices, check box, focused, not checked, off screen",
  "Reprimands, check box, focused, not checked, off screen",
  "Monetary penalties, check box, focused, not checked, off screen",
  "Prosecutions, check box, focused, not checked, off screen",
  "Clear, button, focused, off screen",
  "Central government, check box, focused, not checked, off screen",
  "Charitable and voluntary, check box, focused, not checked, off screen",
  "Criminal justice, check box, focused, not checked, off screen",
  "Education and childcare, check box, focused, not checked, off screen",
  "Finance insurance and credit, check box, focused, not checked, off screen",
  "General business, check box, focused, not checked, off screen",
  "Health, check box, focused, not checked, off screen",
  "Land or property services, check box, focused, not checked, off screen",
  "Legal, check box, focused, not checked, off screen",
  "Local government, check box, focused, not checked, off screen",
  "Marketing, check box, focused, not checked, off screen",
  "Media, check box, focused, not checked, off screen",
  "Online technology and telecoms, check box, focused, not checked, off screen",
  "Political, check box, focused, not checked, off screen",
  "Regulators, check box, focused, not checked, off screen",
  "Retail and manufacture, check box, focused, not checked, off screen",
  "Social care, check box, focused, not checked, off screen",
  "Transport and leisure, check box, focused, not checked, off screen",
  "Utilities, check box, focused, not checked, off screen",
  "Clear, button, focused, off screen",
  "Last month, radio button, focused, not checked, off screen, 1 of 3",
  "Day From, spin button, 0, focused, off screen",
  "Show date picker, menu button, focused, sub Menu, off screen",
  "Day To, spin button, 0, focused, off screen",
  "Show date picker, menu button, focused, sub Menu, off screen",
  "Clear, button, focused, off screen",
  "Sort by, combo box, Date (newest), focused, collapsed",
  "ACRO Criminal Records Office 7 August 2026, Reprimands, Central government The Information Commissioner (the Commissioner), link, focused, linked",
  "Elderly Aids Limited 6 August 2026, Enforcement notices, General business Contravention of Regulations 21 and 24. Elderly, link, focused, linked",
  "Elderly Aids Limited 6 August 2026, Monetary penalties, General business Contravention of Regulations 21 and 24. Elderly, link, focused, linked",
  "Chief Constable Commissioner for the Metropolis slash Metropolitan Police Service (MPS) 27 July 2026, Reprimands, Criminal justice Incident 1 (ICO Ref: INV slash 0034 slash 2025), concerning, link, focused, linked",
  "Chief Constable Commissioner for the Metropolis slash Metropolitan Police Service (MPS) 27 July 2026, Enforcement notices, Criminal justice Incident 1 (ICO Ref: INV slash 0034 slash 2025), concerning, link, focused, linked",
  "Geoffrey Smith 17 July 2026, Prosecutions A council worker who unlawfully accessed hundre, link, focused, linked",
  "Debbie Okparavero and Maliha Islam – Proceeds of Crime Act 29 May 2026, Prosecutions Confiscation orders totalling over £118,000 hav, link, focused, linked",
  "Thermotech Wall and Loft Surveys Ltd 28 May 2026, Enforcement notices In April 2025, the ICO carried out a search war, link, focused, linked",
  "Thermotech Wall and Loft Surveys Ltd 28 May 2026, Monetary penalties In April 2025, the ICO carried out a search war, link, focused, linked",
  "KRA Consultancy Ltd 20 May 2026, Monetary penalties, Marketing KRA Consultancy Ltd was fined £300,000 for send, link, focused, linked",
  "KRA Consultancy Ltd 20 May 2026, Enforcement notices, Marketing KRA Consultancy Ltd was issued with an enforcem, link, focused, linked",
  "Rizwan Manjra – Proceeds of Crime Act 15 May 2026, Prosecutions We have secured a £355,000 confiscation order a, link, focused, linked",
  "South Staffordshire Plc and South Staffordshire Water Plc 7 May 2026, Monetary penalties, Utilities The Information Commissioner’s Office (ICO) has, link, focused, linked",
  "SA Assistance Ltd 21 April 2026, Enforcement notices, General business Contravention of Regulation 21A and 24 of the P, link, focused, linked",
  "Energy Prices Direct Limited 30 March 2026, Monetary penalties, Utilities Contravention of Regulations 21 and 24 of the P, link, focused, linked",
  "Jacksons Marketing Ltd 12 March 2026, Enforcement notices Jacksons Marketing Ltd was fined £130,000 for m, link, focused, linked",
  "Jacksons Marketing Ltd 12 March 2026, Monetary penalties Jacksons Marketing Ltd was fined £130,000 for m, link, focused, linked",
  "Reddit, Inc. 23 February 2026, Monetary penalties, Online technology and telecoms We imposed a £14,472,500.00 penalty to Reddit,, link, focused, linked",
  "The Commissioner of Police for the City of London 20 February 2026, Reprimands, Criminal justice A reprimand has been issued to The Commissioner, link, focused, linked",
  "Christopher Munro and William Chipoma 11 February 2026, Prosecutions Two further people have been convicted followin, link, focused, linked",
  "Media Lab dot AI, Inc. 4 February 2026, Monetary penalties, Online technology and telecoms £247,590 penalty imposed on Media Lab dot AI, Inc. i, link, focused, linked",
  "TMAC Ltd 3 February 2026, Enforcement notices, General business TMAC contravened regulations 21 and 24 of PECR, link, focused, linked",
  "TMAC Ltd 3 February 2026, Monetary penalties, General business TMAC contravened regulations 21 and 24 of PECR, link, focused, linked",
  "Allay Claims Ltd 15 January 2026, Enforcement notices, Finance insurance and credit MPN and EN issued to Allay Claims Ltd due to a, link, focused, linked",
  "Allay Claims Ltd 15 January 2026, Monetary penalties, Finance insurance and credit MPN and EN issued to Allay Claims Ltd due to a, link, focused, linked",
  "Next, button, focused",
  " Back to top, link, focused, linked, same page",
  " Print this page, button, focused",
  "Icon for the X at ICO News social link X at ICO News, link, focused, linked",
  "Icon for the You Tube social link You Tube, link, focused, linked",
  "Icon for the Linked In social link Linked In, link, focused, linked",
  "Icon for the Facebook social link Facebook, link, focused, linked",
  "Icon for the Subscribe to our e-newsletter social link Subscribe to our e-newsletter, link, focused, linked",
  "Contact us, link, focused, linked",
  "Privacy notice, link, focused, linked",
  "Cookies, link, focused, linked",
  "Accessibility, link, focused, linked",
  "Cymraeg, link, focused, linked",
  "Disclaimer, link, focused, linked",
  "copyright Copyright, link, focused, linked",
  "Open Government Licence v 3.0, link, focused, linked",
  "Search tabs, button, focused, collapsed",
  "Enforcement action ICO - Memory usage - 216 MB, tab, focused, selected, ico dot org dot uk, 1 of 1",
  "New Tab, button, focused, New tab (Ctrl plus T), Ctrl plus, T",
  "Back, button, focused, Press to go back (Alt plus Left arrow), or open context menu to see history",
  "Refresh, button, focused, Refresh this page, hold to see more options",
  "View site information, button, focused, collapsed, Secure",
  "Address and search bar, search landmark, focused, collapsed, Search or enter web address, Ctrl plus, L, selected https: slash slash ico dot org dot uk slash action-weve-taken slash enforcement slash",
  "Enter Reading mode (F 9), button, focused",
  "Add this page to favourites (Ctrl plus D), button, focused, collapsed",
  "Control your music, videos and more, button, focused",
  "Favourites, button, focused, Favourites (Ctrl plus Shift plus O)",
  "Edge Secure Network is Connected, button, focused",
  "Profile 1 Profile, button, focused, collapsed, Profile 1",
  "Settings and more (Alt plus F), button, focused",
  "Chat, button, focused, Copilot (Ctrl plus Shift plus .)",
  "Cookie options, button, focused, collapsed",
  "Skip to main content , link, focused, visited, linked, same page",
  "Home, link, focused, linked",
  " Cymraeg, link, focused, linked",
];
const ICO_TRANSCRIPT = [
  "button, collapsed, Cookie options",
  "out of region, visited, same page, link, Skip to main content",
  "banner landmark, link, Home",
  "clickable, link, Cymraeg",
  "button, Search",
  "button, Menu",
  "main landmark, breadcrumb, navigation landmark, list, with 2 items, link, Action we've taken, slash",
  "Enforcement action",
  "out of list, heading, level 1, Enforcement action",
  "list, with 1 item, When searching by date, incorrect results may be produced due to errors with the dates of some",
  "documents added before 31 December 2024.",
  "out of list, clickable, Filters",
  "complementary landmark, section, grouping, Keywords",
  "Keywords",
  "edit, , button, Clear",
  "out of grouping, grouping, Type",
  "list, with 4 items, check box, not checked",
  "Enforcement notices",
  "check box, not checked",
  "Reprimands",
  "Monetary penalties",
  "Prosecutions",
  "out of list, button, Clear",
  "out of grouping, grouping, Sector",
  "list, with 19 items, check box, not checked",
  "Central government",
  "Charitable and voluntary",
  "Criminal justice",
  "Education and childcare",
  "Finance insurance and credit",
  "General business",
  "Health",
  "Land or property services",
  "Legal",
  "Local government",
  "Marketing",
  "Media",
  "Online technology and telecoms",
  "Political",
  "Regulators",
  "Retail and manufacture",
  "Social care",
  "Transport and leisure",
  "Utilities",
  "out of grouping, grouping, Date",
  "list, with 1 item, radio button, not checked",
  "Last month",
  "radio button, not checked",
  "Last year",
  "From",
  "clickable, spin button, 0, slash, spin button, 0, slash, spin button, 0",
  "menu button, sub Menu, Show date picker",
  "To",
  "out of grouping, out of section, 1 to 25 of 222",
  "Sort by",
  "combo box, collapsed, Date (newest)",
  "list, with 25 items, link, heading, level 4, ACRO Criminal Records Office",
  "link, 7 August 2026, Reprimands, Central government",
  "link, The Information Commissioner (the Commissioner) issues a reprimand to ACRO Criminal Records Office f",
  "link, or infringements of Articles 32(1), 32(1)(b) and 32(1)(d) of the UK GDPR. This enforcement action fo",
  "link, llows a cyber incident in which the personal data of approximately 10,000 UK data subjects may have",
  "link, been affected.",
  "link, heading, level 4, Elderly Aids Limited",
  "link, 6 August 2026, Enforcement notices, General business",
  "link, Contravention of Regulations 21 and 24. Elderly Aids Limited promoted call blocking devices. Elderly",
  "link, Aids Limited made 758,053 unsolicited direct marketing calls to subscribers who were registered wit",
  "link, h the TPS slash CTPS and who had not notified EAL that they were willing to receive such calls, and 20 c",
  "link, omplaints being made as a result.",
  "link, 6 August 2026, Monetary penalties, General business",
];
const ICO_TRUNCATED_HEARD = [
  "Reddit, Inc., heading, level 4, link",
  "Reddit, Inc., heading, level 4, 23 February 2026, Monetary penalties, Online technology and telecoms, We imposed a £14,472,500.00 penalty to Reddit, Inc. for infringing Articles 5(1)(a), 6, and 8, and Article 35 of the UK GDPR., link",
];

const focusOrderFindings = (focusOrder: string[], transcript = TRANSCRIPT) =>
  ruleFindings({ transcript, structure: {}, interaction: { focusOrder } } as never)
    .filter((finding) => finding.wcag.startsWith("2.4.3"));

test("#1514: the local address-bar recogniser reads what evidence's published leftSite() reads", () => {
  // The copy in channel-comparison.ts is pinned here, through the published function, because evidence keeps its own
  // pattern private. `leftSite()` derives `to` from the address-bar stop when an activation announced a new window.
  const capture: SiteBoundCapture = {
    url: "https://www.w3.org/WAI",
    structure: { headings: [], landmarks: [], formFields: [EMBED], links: [], graphics: [], lists: [], frames: [],
      tableCells: [] },
    interaction: {
      controls: [EMBED], stateChanges: [], postSubmitFields: [], postSubmitNames: [],
      formChanges: [{ control: EMBED, kind: "taskButton", after: "Opening new window" }],
      navigatedOnSubmit: { checked: true, navigated: false },
      focusOrder: ["You Tube Home, link, focused, linked", YOUTUBE_TAB, REHEARSAL_ADDRESS_BAR],
    },
  };
  const published = leftSite(capture)?.to;
  assert.equal(published, "https://www.youtube.com", "the positive control: the published function reads the bar");
  assert.equal(addressBarHost(REHEARSAL_ADDRESS_BAR), published);
  assert.equal(addressBarHost(ICO_ADDRESS_BAR), "https://ico.org.uk");
  for (const notTheBar of [YOUTUBE_TAB, EMBED, SKIP, ...BROWSER_UI]) {
    assert.equal(addressBarHost(notTheBar), null, `not the address bar: ${notTheBar.slice(0, 40)}`);
  }
});

test("#1514: fromDocumentEntry leaves a walk with no address bar unchanged, and rotates one that has it", () => {
  const pageNames = new Set(["Cookie options", "Skip to main content", "Search", "Menu"]);
  const noMarker = [SKIP, SEARCH, MENU, ...BROWSER_UI, COOKIE];
  assert.deepEqual(fromDocumentEntry(noMarker, pageNames), noMarker, "no marker, no rotation");
  const marked = [SKIP, SEARCH, MENU, BROWSER_UI[0], ICO_ADDRESS_BAR, BROWSER_UI[2], COOKIE, SKIP];
  assert.deepEqual(fromDocumentEntry(marked, pageNames),
    [COOKIE, SKIP, SKIP, SEARCH, MENU, BROWSER_UI[0], ICO_ADDRESS_BAR, BROWSER_UI[2]],
    "rotated to the first page control after the address bar, skipping browser controls");
});

test("#1514: a walk entered one stop in, with the address bar before re-entry, is NOT a 2.4.3 reordering", () => {
  const walk = [SKIP, SEARCH, MENU, ...BROWSER_UI.slice(0, 2), ICO_ADDRESS_BAR, BROWSER_UI[2], COOKIE, SKIP];
  assert.deepEqual(focusOrderFindings(walk), [],
    "in the page's own Tab cycle Cookie options comes straight before Skip, as it reads");
});

test("#1514: the same walk with NO address bar still fires -- a control may be genuinely last in Tab order", () => {
  const walk = [SKIP, SEARCH, MENU, ...BROWSER_UI, COOKIE, SKIP];
  assert.equal(focusOrderFindings(walk).length, 1,
    "positive control: without the marker the rotation cannot be proven, so the baselined pages' shape still fires");
});

test("#1514: a genuinely scrambled Tab order still fires, with the address-bar marker present", () => {
  const walk = [MENU, SKIP, BROWSER_UI[0], ICO_ADDRESS_BAR, COOKIE, MENU, SEARCH, SKIP];
  assert.equal(focusOrderFindings(walk).length, 1,
    "positive control: rotating to document entry must not hide a real reordering (Menu before Search)");
});

test("#1514: the recorded ico enforcement walk no longer reports 2.4.3, and fires without its address bar", () => {
  // The firing control, from the capture itself: today's line comparison reported, verbatim (#1043 5658126858),
  // reads as ["Cookie options","Search","Menu","Keywords","Clear","Enforcement notices","Last month"] but tabs as
  // ["Search","Menu","Keywords","Clear","Enforcement notices","Last month","Cookie options"]. Stop [87] is the
  // address bar; the first page control after it is [96] "Cookie options", where Tab re-enters the document.
  const real = (focusOrder: string[]) => ruleFindings({ transcript: ICO_TRANSCRIPT, structure: {},
    interaction: { focusOrder }, truncated: ICO_TRUNCATED_HEARD } as never);
  assert.equal(ICO_WALK.length, 100);
  assert.equal(ICO_WALK.filter((entry) => addressBarHost(entry) !== null).length, 1, "one marker, at [87]");
  assert.deepEqual(real(ICO_WALK), [], "read from document entry, the page's Tab order is its reading order");
  const unmarked = ICO_WALK.filter((entry) => addressBarHost(entry) === null);
  assert.deepEqual(real(unmarked).map((finding) => finding.wcag), ["2.4.3 Focus Order"],
    "positive control: the same real walk without its marker still fires, so the zero above is the rotation");
});
