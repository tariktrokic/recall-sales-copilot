/**
 * Replays a scripted sales call against the app as signed Recall webhooks, so you can work on
 * the UI and pipeline without joining a real meeting (and without spending bot minutes).
 *
 *   npm run simulate                                  # against http://localhost:3000
 *   npm run simulate -- https://your-app.vercel.app   # against a deployment
 *   npm run simulate -- --fast                        # no pauses between lines
 *   npm run simulate -- --no-chat                     # skip the @copilot chat command
 *
 * It needs DATABASE_URL and RECALL_WEBHOOK_SECRET (same values as the target app) because it
 * creates the meeting row directly instead of asking Recall for a bot. Everything after that
 * goes through the real webhook routes. The bot id is fake, so chat replies and the post-call
 * transcript request fail at Recall, which also exercises the live-transcript fallback.
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { insertMeeting, updateMeeting } from "@/lib/db/repository";
import { signRecallPayload } from "@/lib/recall/verify";
import { WEBHOOK_PATHS } from "@/lib/constants/urls";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const args = process.argv.slice(2);
const fast = args.includes("--fast");
const withChat = !args.includes("--no-chat");
const target = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000").replace(/\/+$/, "");

const REP = { id: 100, name: "Riley Rep", is_host: true, platform: "desktop", extra_data: null, email: null };
const PROSPECT = { id: 200, name: "Pat Chen", is_host: false, platform: "desktop", extra_data: null, email: null };

const CALL: [typeof REP, string][] = [
  [REP, "Hi Pat, thanks for making the time. How is the quarter going so far?"],
  [PROSPECT, "Busy. We're onboarding two new regions and our support team is drowning in tickets."],
  [REP, "That makes sense. What does a typical week look like for the support team right now?"],
  [PROSPECT, "About four thousand tickets, and roughly a third are the same five questions about order status."],
  [REP, "Got it. And how are you measuring success for this project?"],
  [PROSPECT, "We want first response time under one hour and to cut cost per ticket by twenty percent."],
  [PROSPECT, "How does your pricing work for a team of forty agents?"],
  [REP, "It's per seat with volume tiers. For forty seats you'd be on the growth plan."],
  [PROSPECT, "Honestly that sounds expensive compared to what we pay for Zendesk today."],
  [REP, "Fair. Most teams offset it within a quarter because deflection reduces the seats they need."],
  [PROSPECT, "Do you support SSO and do you have a SOC 2 report?"],
  [REP, "Yes to both. I can send the SOC 2 report under NDA after this call."],
  [PROSPECT, "Good. Our CFO Dana signs off on anything over fifty thousand, so she'll need to see the business case."],
  [REP, "Understood. What's your timeline for a decision?"],
  [PROSPECT, "We'd like something live before the holiday peak, so a decision by mid November."],
  [REP, "Great. I'll send pricing, the SOC 2 report, and a draft business case for Dana by Friday."],
];

const pause = (ms: number) => (fast ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

async function main() {
  const { RECALL_WEBHOOK_SECRET: secret } = env();
  const meeting = await insertMeeting({
    meetingUrl: "https://meet.google.com/sim-ulat-ion",
    platform: "google_meet",
    joinAt: null,
  });
  const bot = { id: `sim_${randomUUID()}`, metadata: { app_meeting_id: meeting.id } };
  await updateMeeting(meeting.id, { botId: bot.id });
  const recording = { id: `sim_rec_${randomUUID()}`, metadata: {} };

  console.log(`Simulated meeting: ${target}/meetings/${meeting.id}\n`);
  let clock = 0; // seconds since the recording started, as Recall's relative timestamps

  async function post(path: string, payload: unknown) {
    const body = JSON.stringify(payload);
    const res = await fetch(`${target}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...signRecallPayload(secret, body, { id: `msg_${randomUUID()}` }) },
      body,
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  }

  const status = (event: string, code: string, extra: Record<string, unknown> = {}) =>
    post(WEBHOOK_PATHS.status, {
      event,
      data: { data: { code, sub_code: null, updated_at: new Date().toISOString() }, bot, ...extra },
    });

  const realtime = (event: string, data: Record<string, unknown>) =>
    post(WEBHOOK_PATHS.realtime, {
      event,
      data: { data, realtime_endpoint: { id: "re_sim", metadata: {} }, recording, bot },
    });

  const participantEvent = (event: string, participant: typeof REP, data: unknown = null) =>
    realtime(event, {
      participant,
      timestamp: { absolute: new Date().toISOString(), relative: clock },
      data,
    });

  const words = (text: string) => {
    const tokens = text.split(" ");
    const perWord = 0.35;
    const start = clock;
    const at = (n: number) => ({ relative: Math.round((start + n * perWord) * 100) / 100 });
    clock = at(tokens.length).relative + 0.6;
    return tokens.map((t, i) => ({ text: t, start_timestamp: at(i), end_timestamp: at(i + 1) }));
  };

  for (const code of ["joining_call", "in_waiting_room", "in_call_not_recording", "in_call_recording"]) {
    await status(`bot.${code}`, code);
    console.log(`bot.${code}`);
    await pause(800);
  }
  await participantEvent("participant_events.join", REP);
  await participantEvent("participant_events.join", PROSPECT);

  for (const [i, [speaker, line]] of CALL.entries()) {
    const w = words(line);
    const half = Math.ceil(w.length / 2);
    await realtime("transcript.partial_data", { words: w.slice(0, half), participant: speaker, language_code: "en" });
    await pause(700);
    await realtime("transcript.data", { words: w, participant: speaker, language_code: "en" });
    console.log(`${speaker.name}: ${line}`);
    await pause(1200);

    if (i === 11 && withChat) {
      await participantEvent("participant_events.chat_message", REP, {
        text: "@copilot note send SOC 2 report under NDA",
        to: "everyone",
      });
      console.log("chat: @copilot note send SOC 2 report under NDA");
    }
  }

  await participantEvent("participant_events.leave", PROSPECT);
  for (const code of ["call_ended", "done"]) {
    await status(`bot.${code}`, code);
    console.log(`bot.${code}`);
    await pause(500);
  }
  await status("recording.done", "done", { recording });
  console.log("recording.done (post-call summary is generated next)");
  console.log(`\nOpen ${target}/meetings/${meeting.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
