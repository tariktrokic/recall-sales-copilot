import { BOT_NAME } from "@/lib/recall/botConfig";
import {
  participantEventSchema,
  realtimeRoutingSchema,
  transcriptEventSchema,
  type ParticipantEvent,
  type StatusWebhook,
} from "@/lib/recall/events";
import {
  isBotStatusEvent,
  isRecordingEvent,
  isTranscriptEvent,
  POST_CALL_TRANSCRIPT_KIND,
  presenceEventType,
  RECALL_EVENT,
  transcriptEventType,
} from "@/lib/constants/recall";
import { APP_EVENT, ARTIFACT_KIND } from "@/lib/constants/events";
import { isTerminalStatus } from "@/lib/constants/status";
import { parseCommand } from "@/lib/copilot/commands";
import { toSegment } from "@/lib/copilot/transcript";
import type { Speaker } from "@/lib/copilot/types";
import { handleChatCommand } from "./chatService";
import { fallbackToLiveTranscript, processPostCallTranscript, requestPostCallTranscript } from "./postCallService";
import * as repo from "@/lib/db/repository";
import type { BackgroundTask } from "@/lib/webhooks/receiver";

/**
 * What each Recall webhook means for a meeting. Called by `receiveRecallWebhook()` after the
 * webhook is verified: turns the payload into our own events and, when slow work is needed
 * (chat replies, post-call transcript, summary), returns it as a task instead of running it.
 */

const now = () => new Date().toISOString();

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

  if (isBotStatusEvent(event)) {
    // Svix doesn't guarantee ordering, so never move a finished meeting back to a live state.
    if (!isTerminalStatus(meeting.statusCode) || isTerminalStatus(code)) {
      await repo.updateMeeting(meeting.id, { statusCode: code, subCode });
    }
    await repo.appendEvent(meeting.id, { type: APP_EVENT.status, payload: { code, subCode, at } });
    return null;
  }

  if (isRecordingEvent(event)) {
    await repo.appendEvent(meeting.id, { type: APP_EVENT.artifact, payload: { kind: ARTIFACT_KIND.recording, code, subCode, at } });
    if (event === RECALL_EVENT.recordingDone && data.recording) {
      const recordingId = data.recording.id;
      await repo.updateMeeting(meeting.id, { recordingId });
      return () => requestPostCallTranscript(meeting.id, recordingId);
    }
    if (event === RECALL_EVENT.recordingFailed) {
      return () => fallbackToLiveTranscript(meeting.id, `Recording failed (${subCode ?? "no sub-code"})`);
    }
    return null;
  }

  if (isTranscriptEvent(event) && data.transcript) {
    const isPostCall = data.transcript.metadata?.kind === POST_CALL_TRANSCRIPT_KIND;
    const transcriptId = data.transcript.id;
    await repo.appendEvent(meeting.id, {
      type: APP_EVENT.artifact,
      payload: { kind: isPostCall ? ARTIFACT_KIND.postCallTranscript : ARTIFACT_KIND.liveTranscript, code, subCode, at },
    });
    if (!isPostCall) return null;
    if (event === RECALL_EVENT.transcriptDone) return () => processPostCallTranscript(meeting.id, transcriptId);
    if (event === RECALL_EVENT.transcriptFailed) {
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

  const transcriptType = transcriptEventType(routing.event);
  if (transcriptType) {
    const { data } = transcriptEventSchema.parse(body);
    const segment = toSegment(data.data.participant, data.data.words);
    if (!segment) return null;
    await repo.appendEvent(meeting.id, { type: transcriptType, payload: segment });
    return null;
  }

  const presenceType = presenceEventType(routing.event);
  if (presenceType) {
    const { data } = participantEventSchema.parse(body);
    await repo.appendEvent(meeting.id, {
      type: presenceType,
      payload: { ...speakerOf(data.data.participant), at: data.data.timestamp.absolute ?? now() },
    });
    return null;
  }

  if (routing.event === RECALL_EVENT.chatMessage) {
    const { data } = participantEventSchema.parse(body);
    const from = speakerOf(data.data.participant);
    const text = data.data.data?.text ?? "";
    if (!text || from.name === BOT_NAME) return null; // ignore our own messages
    await repo.appendEvent(meeting.id, {
      type: APP_EVENT.chatIn,
      payload: { ...from, text, at: data.data.timestamp.absolute ?? now() },
    });
    const command = parseCommand(text);
    return command ? () => handleChatCommand(meeting, command, from) : null;
  }

  return null;
}
