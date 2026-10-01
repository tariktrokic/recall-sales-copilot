import * as recall from "@/lib/recall/client";
import { fitChatMessage, HELP_TEXT, maxChatLength, REPLY_PREFIX, type ChatCommand } from "@/lib/copilot/commands";
import { generateRecap } from "@/lib/copilot/insights";
import type { Speaker } from "@/lib/copilot/types";
import type { Meeting } from "@/lib/db/schema";
import * as repo from "./repository";

const REPLY_INTERVAL_SECONDS = 5;

/** Runs a `@copilot ...` command typed into the meeting chat and replies in the chat. */
export async function handleChatCommand(meeting: Meeting, command: ChatCommand, from: Speaker): Promise<void> {
  if (!meeting.botId) return;
  const at = () => new Date().toISOString();

  // Notes are saved even when the reply itself gets rate-limited.
  if (command.kind === "note") {
    await repo.appendEvent(meeting.id, { type: "note", payload: { text: command.text, by: from.name, at: at() } });
  }

  if (!(await repo.claimReplySlot(meeting.id, REPLY_INTERVAL_SECONDS))) return;

  let reply: string;
  switch (command.kind) {
    case "help":
      reply = HELP_TEXT;
      break;
    case "note":
      reply = `${REPLY_PREFIX} noted "${command.text}". It will be in the post-call summary.`;
      break;
    case "recap": {
      // Recall has no "transcript so far" endpoint, so recaps come from our own event log.
      const [finals, notes] = await Promise.all([
        repo.eventsOfType(meeting.id, ["transcript.final"]),
        repo.eventsOfType(meeting.id, ["note"]),
      ]);
      const recap = await generateRecap(
        finals.map((e) => e.payload),
        notes.map((e) => e.payload),
      );
      reply = `${REPLY_PREFIX} ${recap}`;
      break;
    }
    case "unknown":
      reply = `${REPLY_PREFIX} I don't know "${command.input}". ${HELP_TEXT.slice(REPLY_PREFIX.length).trim()}`;
      break;
  }

  const message = fitChatMessage(reply, maxChatLength(meeting.platform));
  try {
    await recall.sendChatMessage(meeting.botId, { message });
  } catch (err) {
    // Typically the bot already left, or the platform blocks bot chat for this meeting.
    const detail = err instanceof Error ? err.message : String(err);
    await repo.appendEvent(meeting.id, { type: "pipeline.error", payload: { stage: "chat reply", message: detail, at: at() } });
    return;
  }
  await repo.appendEvent(meeting.id, { type: "chat.out", payload: { text: message, at: at() } });
}
