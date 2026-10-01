import { publicUrl } from "@/lib/env";
import { buildBotConfig, BOT_NAME, detectPlatform } from "@/lib/recall/botConfig";
import * as recall from "@/lib/recall/client";
import {
  participantEventSchema,
  realtimeRoutingSchema,
  transcriptEventSchema,
  type ParticipantEvent,
  type StatusWebhook,
} from "@/lib/recall/events";
import { isTerminalStatus } from "@/lib/recall/subCodes";
import { parseCommand } from "@/lib/copilot/commands";
import { toSegment } from "@/lib/copilot/transcript";
import type { Speaker } from "@/lib/copilot/types";
import type { Meeting } from "@/lib/db/schema";
import { handleChatCommand } from "./chat";
import { fallbackToLiveTranscript, processPostCallTranscript, requestPostCallTranscript } from "./postCall";
import * as repo from "./repository";

/**
 * Work that must not delay the webhook response (Recall delivers realtime events in order,
 * so a slow handler holds up every transcript line behind it). Routes run it with `after()`.
 */
export type BackgroundTask = () => Promise<void>;

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Creating a meeting = creating a bot
// ---------------------------------------------------------------------------

export async function createMeeting(input: { meetingUrl: string; joinAt: Date | null }): Promise<Meeting> {
  const origin = publicUrl(); // fail before writing anything if Recall couldn't reach us
  const meeting = await repo.insertMeeting({
    meetingUrl: input.meetingUrl,
    platform: detectPlatform(input.meetingUrl),
    joinAt: input.joinAt,
  });

  const config = buildBotConfig({
    meetingUrl: input.meetingUrl,
    meetingId: meeting.id,
    publicUrl: origin,
    joinAt: input.joinAt?.toISOString(),
  });

  try {
    // Our meeting id doubles as the idempotency key: a retried request can't create two bots.
    const bot = await recall.createBot(config, { idempotencyKey: meeting.id });
    const statusCode = input.joinAt ? "scheduled" : "created";
    await repo.updateMeeting(meeting.id, { botId: bot.id, statusCode });
    await repo.appendEvent(meeting.id, { type: "status", payload: { code: statusCode, subCode: null, at: now() } });
    return { ...meeting, botId: bot.id, statusCode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.updateMeeting(meeting.id, { statusCode: "create_failed" });
    await repo.appendEvent(meeting.id, {
      type: "status",
      payload: { code: "create_failed", subCode: null, at: now(), message },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Dashboard webhooks: bot.*, recording.*, transcript.*
// ---------------------------------------------------------------------------

export async function ingestStatusWebhook(evt: StatusWebhook): Promise<BackgroundTask | null> {
  const { event, data } = evt;
  const meeting = await repo.findMeetingForBot(data.bot);
  if (!meeting) return null; // a bot from another app or environment sharing this workspace

  const code = data.data.code;
  const subCode = data.data.sub_code ?? null;
  const at = data.data.updated_at ?? now();

  if (event.startsWith("bot.")) {
    // Svix doesn't guarantee ordering, so never move a finished meeting back to a live state.
    if (!isTerminalStatus(meeting.statusCode) || isTerminalStatus(code)) {
      await repo.updateMeeting(meeting.id, { statusCode: code, subCode });
    }
    await repo.appendEvent(meeting.id, { type: "status", payload: { code, subCode, at } });
    return null;
  }

  if (event.startsWith("recording.")) {
    await repo.appendEvent(meeting.id, { type: "artifact", payload: { kind: "recording", code, subCode, at } });
    if (event === "recording.done" && data.recording) {
      const recordingId = data.recording.id;
      await repo.updateMeeting(meeting.id, { recordingId });
      return () => requestPostCallTranscript(meeting.id, recordingId);
    }
    if (event === "recording.failed") {
      return () => fallbackToLiveTranscript(meeting.id, `Recording failed (${subCode ?? "no sub-code"})`);
    }
    return null;
  }

  if (event.startsWith("transcript.") && data.transcript) {
    // We tag the transcript we create after the call, so its webhook identifies itself.
    const isPostCall = data.transcript.metadata?.kind === "post_call";
    const transcriptId = data.transcript.id;
    await repo.appendEvent(meeting.id, {
      type: "artifact",
      payload: { kind: isPostCall ? "post_call_transcript" : "live_transcript", code, subCode, at },
    });
    if (!isPostCall) return null;
    if (event === "transcript.done") return () => processPostCallTranscript(meeting.id, transcriptId);
    if (event === "transcript.failed") {
      return () => fallbackToLiveTranscript(meeting.id, `Post-call transcription failed (${subCode ?? "no sub-code"})`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Realtime endpoint events: transcript and participant events while the bot records
// ---------------------------------------------------------------------------

function speakerOf(p: ParticipantEvent["data"]["data"]["participant"]): Speaker {
  return { participantId: p.id, name: p.name?.trim() || `Participant ${p.id}`, isHost: p.is_host ?? false };
}

export async function ingestRealtimeEvent(body: unknown): Promise<BackgroundTask | null> {
  const routing = realtimeRoutingSchema.parse(body);
  const meeting = await repo.findMeetingForBot(routing.data.bot);
  if (!meeting) return null;

  switch (routing.event) {
    case "transcript.data":
    case "transcript.partial_data": {
      const { data } = transcriptEventSchema.parse(body);
      const segment = toSegment(data.data.participant, data.data.words);
      if (!segment) return null;
      const type = routing.event === "transcript.data" ? "transcript.final" : "transcript.partial";
      await repo.appendEvent(meeting.id, { type, payload: segment });
      return null;
    }

    case "participant_events.join":
    case "participant_events.leave": {
      const { data } = participantEventSchema.parse(body);
      const type = routing.event === "participant_events.join" ? "participant.join" : "participant.leave";
      await repo.appendEvent(meeting.id, {
        type,
        payload: { ...speakerOf(data.data.participant), at: data.data.timestamp.absolute ?? now() },
      });
      return null;
    }

    case "participant_events.chat_message": {
      const { data } = participantEventSchema.parse(body);
      const from = speakerOf(data.data.participant);
      const text = data.data.data?.text ?? "";
      if (!text || from.name === BOT_NAME) return null; // ignore our own messages
      await repo.appendEvent(meeting.id, {
        type: "chat.in",
        payload: { ...from, text, at: data.data.timestamp.absolute ?? now() },
      });
      const command = parseCommand(text);
      return command ? () => handleChatCommand(meeting, command, from) : null;
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// User actions from the dashboard
// ---------------------------------------------------------------------------

export async function makeBotLeave(meeting: Meeting): Promise<void> {
  if (!meeting.botId) throw new Error("This meeting has no bot");
  await recall.leaveCall(meeting.botId);
}

/** Fresh signed URL on every call: Recall download URLs expire after a few hours. */
export async function getRecordingUrl(meeting: Meeting): Promise<string | null> {
  if (!meeting.botId) return null;
  const bot = await recall.getBot(meeting.botId);
  const recording = bot.recordings.find((r) => r.id === meeting.recordingId) ?? bot.recordings[0];
  return recording?.media_shortcuts?.video_mixed?.data?.download_url ?? null;
}
