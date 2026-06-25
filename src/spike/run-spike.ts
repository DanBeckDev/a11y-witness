/**
 * M0 SPIKE: is the core bet real?
 *
 * Goal: prove that an AI model can judge the REAL screen-reader experience
 * trustworthily. We drive VoiceOver (via Guidepup) through a page the way a
 * real user navigates, capture what it announces, and ask the AI judge whether
 * the experience was coherent and usable.
 *
 * This models real navigation (read in browse mode, jump by headings), NOT
 * tabbing. Tabbing only reaches interactive controls and is not how
 * screen-reader users read a page.
 *
 * Guidepup's VoiceOver API (method and command names) should be verified
 * against https://www.guidepup.dev/docs/api/class-voiceover . The structure
 * and the navigation model here are the point of the spike; treat the exact
 * calls as a starting point to confirm and refine.
 */
import "dotenv/config";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { voiceOver } from "@guidepup/guidepup";
import { judge } from "./judge.js";

const sh = promisify(exec);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const url = process.argv[2];
  const task = process.argv[3] ?? "Read and understand this page";
  if (!url) {
    console.error('Usage: npm run spike -- <url> "<task>"');
    process.exit(1);
  }

  // Open the page in Safari, which VoiceOver drives well on macOS.
  await sh(`open -a Safari ${JSON.stringify(url)}`);
  await delay(3000);

  const transcript: string[] = [];

  await voiceOver.start();
  try {
    // Move VoiceOver into the page's web content.
    await voiceOver.navigateToWebContent();

    // 1) Read through the page in browse mode, the way a user first orients.
    //    Capture each announcement up to a sane cap.
    for (let i = 0; i < 60; i++) {
      await voiceOver.next();
      const phrase = await voiceOver.lastSpokenPhrase();
      if (phrase) transcript.push(`[read] ${phrase}`);
    }

    // 2) NEXT STEP: add heading navigation, a primary real-user pattern.
    //    Confirm the exact command against the Guidepup docs, e.g.:
    //    for (let i = 0; i < 10; i++) {
    //      await voiceOver.perform(voiceOver.keyboardCommands.findNextHeading);
    //      transcript.push(`[heading] ${await voiceOver.lastSpokenPhrase()}`);
    //    }
    //
    //    The complete spoken log is also available via voiceOver.spokenPhraseLog().
  } finally {
    await voiceOver.stop();
  }

  console.log(`\nCaptured ${transcript.length} announcements. Judging...\n`);

  const verdict = await judge({ url, task, screenReader: "VoiceOver", transcript });
  console.log(JSON.stringify(verdict, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
