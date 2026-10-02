/**
 * Human-readable explanations for Recall bot status codes and sub-codes.
 * Lists: https://docs.recall.ai/docs/bot-status-change-events and https://docs.recall.ai/docs/sub-codes
 * Unknown codes fall through to the raw value, because Recall adds new ones over time.
 */

import { RECALL_STATUS } from "@/lib/constants/recall";
import { APP_STATUS } from "@/lib/constants/status";

export const STATUS_LABELS: Record<string, string> = {
  [APP_STATUS.created]: "Bot created",
  [APP_STATUS.scheduled]: "Scheduled to join",
  [RECALL_STATUS.joiningCall]: "Joining the call",
  [RECALL_STATUS.inWaitingRoom]: "In the waiting room",
  [RECALL_STATUS.inCallNotRecording]: "In the call, not recording yet",
  [RECALL_STATUS.recordingPermissionAllowed]: "Host allowed recording",
  [RECALL_STATUS.recordingPermissionDenied]: "Host denied recording",
  [RECALL_STATUS.inCallRecording]: "Recording",
  [RECALL_STATUS.callEnded]: "Left the call",
  [RECALL_STATUS.done]: "Done, media is ready",
  [RECALL_STATUS.fatal]: "Failed",
  [APP_STATUS.createFailed]: "Could not create the bot",
};

export type Tone = "neutral" | "waiting" | "live" | "success" | "error";

const TONES: Record<string, Tone> = {
  [RECALL_STATUS.inCallRecording]: "live",
  [RECALL_STATUS.done]: "success",
  [RECALL_STATUS.fatal]: "error",
  [APP_STATUS.createFailed]: "error",
  [RECALL_STATUS.recordingPermissionDenied]: "error",
  [RECALL_STATUS.inWaitingRoom]: "waiting",
  [RECALL_STATUS.joiningCall]: "waiting",
  [RECALL_STATUS.inCallNotRecording]: "waiting",
};

export function statusTone(code: string): Tone {
  return TONES[code] ?? "neutral";
}

const SUB_CODES: Record<string, { label: string; action?: string }> = {
  // call_ended
  call_ended_by_host: { label: "The host ended the meeting" },
  call_ended_by_platform_idle: { label: "The platform ended the call for inactivity" },
  call_ended_by_platform_max_length: { label: "The platform's maximum meeting length was reached" },
  call_ended_by_platform_waiting_room_timeout: {
    label: "The platform removed the bot from the waiting room",
    action: "Admit the bot sooner, or let it bypass the waiting room.",
  },
  timeout_exceeded_waiting_room: {
    label: "Nobody admitted the bot from the waiting room in time",
    action: "Ask the host to admit the bot, or raise automatic_leave.waiting_room_timeout.",
  },
  timeout_exceeded_noone_joined: { label: "Nobody joined the meeting" },
  timeout_exceeded_everyone_left: { label: "Everyone else left, so the bot left too" },
  timeout_exceeded_silence_detected: { label: "Left after a long period of silence" },
  timeout_exceeded_only_bots_detected_using_participant_names: { label: "Only other bots were left in the call" },
  timeout_exceeded_only_bots_detected_using_participant_events: { label: "Only other bots were left in the call" },
  timeout_exceeded_in_call_not_recording: { label: "Sat in the call without recording for too long" },
  timeout_exceeded_recording_permission_denied: {
    label: "Recording permission was denied, so the bot left",
    action: "On Zoom, the host must allow local recording for the bot.",
  },
  timeout_exceeded_max_duration: { label: "Hit the configured maximum duration" },
  bot_kicked_from_call: { label: "Someone removed the bot from the call" },
  bot_kicked_from_waiting_room: { label: "Someone denied the bot entry from the waiting room" },
  bot_received_leave_call: { label: "Left because the app asked it to" },
  // fatal
  bot_errored: { label: "The bot hit an unexpected error", action: "Check the bot's logs in the Recall dashboard." },
  meeting_not_found: { label: "The meeting link does not exist", action: "Double-check the meeting URL." },
  meeting_not_started: { label: "The meeting had not started", action: "Start the meeting, then send the bot again." },
  meeting_requires_registration: { label: "The meeting requires registration" },
  meeting_requires_sign_in: {
    label: "The meeting only allows signed-in users",
    action: "Allow guests, or configure signed-in bots for this platform.",
  },
  meeting_link_expired: { label: "The meeting link has expired" },
  meeting_link_invalid: { label: "The meeting link is not valid", action: "Paste the full join URL." },
  meeting_password_incorrect: { label: "The meeting passcode is wrong", action: "Use the link that embeds the passcode." },
  meeting_locked: { label: "The meeting is locked" },
  meeting_full: { label: "The meeting is full" },
  meeting_ended: { label: "The meeting had already ended" },
  failed_to_launch_in_time: {
    label: "Recall could not launch a bot in time",
    action: "Schedule bots 10+ minutes ahead with join_at to guarantee capacity.",
  },
  // recording_permission_denied (Zoom)
  zoom_local_recording_disabled: {
    label: "Local recording is disabled for this Zoom account",
    action: "Enable local recording in the Zoom account settings.",
  },
  zoom_local_recording_request_denied_by_host: { label: "The Zoom host denied the recording request" },
  zoom_bot_in_waiting_room: { label: "The bot is still in the Zoom waiting room" },
};

export function describeStatus(code: string, subCode?: string | null): { label: string; detail?: string; action?: string } {
  const label = STATUS_LABELS[code] ?? code;
  if (!subCode) return { label };
  const sub = SUB_CODES[subCode];
  return { label, detail: sub?.label ?? subCode, action: sub?.action };
}