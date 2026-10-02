import type { MeetingEventType } from "@/lib/copilot/types";
import { APP_EVENT } from "./events";

/**
 * Recall's vocabulary: the webhook event names and bot status codes the app reacts to, and how
 * events map to our own event types. Payload schemas keep both as plain strings, because Recall
 * adds new ones over time; anything not listed here is acknowledged and ignored, or shown as-is.
 */

// ---------------------------------------------------------------------------
// Bot status codes (`data.data.code` on bot.* webhooks)
// https://docs.recall.ai/docs/bot-status-change-events
// ---------------------------------------------------------------------------

export const RECALL_STATUS = {
  joiningCall: "joining_call",
  inWaitingRoom: "in_waiting_room",
  inCallNotRecording: "in_call_not_recording",
  recordingPermissionAllowed: "recording_permission_allowed",
  recordingPermissionDenied: "recording_permission_denied",
  inCallRecording: "in_call_recording",
  callEnded: "call_ended",
  /** The bot has finished and its media is ready. */
  done: "done",
  fatal: "fatal",
} as const;

// ---------------------------------------------------------------------------
// Meeting platforms (stored in `meetings.platform`)
// ---------------------------------------------------------------------------

export const RECALL_PLATFORM = {
  zoom: "zoom",
  googleMeet: "google_meet",
  microsoftTeams: "microsoft_teams",
  webex: "webex",
  /** Ours, not Recall's: the URL matched no known platform. */
  unknown: "unknown",
} as const;

export type Platform = (typeof RECALL_PLATFORM)[keyof typeof RECALL_PLATFORM];

// ---------------------------------------------------------------------------
// Webhook event names
// https://docs.recall.ai/docs/real-time-event-payloads
// ---------------------------------------------------------------------------

export const RECALL_EVENT = {
  // Realtime endpoint (configured per bot)
  transcriptData: "transcript.data",
  transcriptPartialData: "transcript.partial_data",
  participantJoin: "participant_events.join",
  participantLeave: "participant_events.leave",
  chatMessage: "participant_events.chat_message",
  // Dashboard webhooks
  recordingDone: "recording.done",
  recordingFailed: "recording.failed",
  transcriptDone: "transcript.done",
  transcriptFailed: "transcript.failed",
} as const;

// Dashboard webhooks come in families named by prefix: bot.joining_call, recording.done, ...
export const isBotStatusEvent = (event: string) => event.startsWith("bot.");
export const isRecordingEvent = (event: string) => event.startsWith("recording.");
export const isTranscriptEvent = (event: string) => event.startsWith("transcript.");

/** Realtime events carrying spoken words, stored as transcript lines. */
export const TRANSCRIPT_EVENT_TO_APP_EVENT = {
  [RECALL_EVENT.transcriptData]: APP_EVENT.transcriptFinal,
  [RECALL_EVENT.transcriptPartialData]: APP_EVENT.transcriptPartial,
} as const satisfies Record<string, MeetingEventType>;

/** Realtime events about someone entering or leaving the meeting, stored as presence changes. */
export const PRESENCE_EVENT_TO_APP_EVENT = {
  [RECALL_EVENT.participantJoin]: APP_EVENT.participantJoin,
  [RECALL_EVENT.participantLeave]: APP_EVENT.participantLeave,
} as const satisfies Record<string, MeetingEventType>;

function lookup<T extends Record<string, string>>(map: T, event: string): T[keyof T] | null {
  return Object.hasOwn(map, event) ? map[event as keyof T] : null;
}

/** Our event type for a Recall transcript event, or null if `event` isn't one. */
export const transcriptEventType = (event: string) => lookup(TRANSCRIPT_EVENT_TO_APP_EVENT, event);

/** Our event type for a Recall join/leave event, or null if `event` isn't one. */
export const presenceEventType = (event: string) => lookup(PRESENCE_EVENT_TO_APP_EVENT, event);

/**
 * What every bot subscribes to on its realtime endpoint. Derived from the handled events above,
 * so subscribing and handling can't drift apart. Each one is billed per occurrence: keep it lean.
 */
export const REALTIME_EVENTS: string[] = [
  ...Object.keys(TRANSCRIPT_EVENT_TO_APP_EVENT),
  ...Object.keys(PRESENCE_EVENT_TO_APP_EVENT),
  RECALL_EVENT.chatMessage,
];

/**
 * `metadata.kind` on the async transcript we request after the call. Recall sends
 * transcript.done for the live transcript too; this tag is how we recognize ours.
 */
export const POST_CALL_TRANSCRIPT_KIND = "post_call";
