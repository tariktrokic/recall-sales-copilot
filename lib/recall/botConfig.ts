/**
 * Everything about how the bot behaves lives here. This is the file to edit first when
 * adapting the app: bot name, consent message, transcription settings, and how long to wait
 * in empty or locked meetings. Which realtime events it subscribes to is derived from the
 * handled events in `lib/constants/recall.ts`.
 *
 * Create Bot reference: https://docs.recall.ai/reference/bot_create
 */

import { RECALL_PLATFORM, REALTIME_EVENTS, type Platform } from "@/lib/constants/recall";
import { WEBHOOK_PATHS } from "@/lib/constants/urls";

export const BOT_NAME = "Sales Copilot";

export const CONSENT_MESSAGE =
  "Hi! I'm Sales Copilot, a notetaker for this call. This meeting is being recorded and transcribed. " +
  "Type @copilot help to see what I can do.";

// Seconds the bot waits before leaving on its own (`automatic_leave`). Recall bills for time
// spent in the waiting room or an empty meeting, and its defaults are 20 minutes; a demo needs less.

/** Nobody admits the bot from the waiting room. Ends with sub-code `timeout_exceeded_waiting_room`. */
export const WAITING_ROOM_TIMEOUT_SECONDS = 10 * 60;
/** The bot got in, but no one else ever joined. Ends with sub-code `timeout_exceeded_noone_joined`. */
export const NOONE_JOINED_TIMEOUT_SECONDS = 10 * 60;

export function detectPlatform(meetingUrl: string): Platform {
  let host: string;
  try {
    host = new URL(meetingUrl).hostname;
  } catch {
    return RECALL_PLATFORM.unknown;
  }
  if (host.endsWith("zoom.us") || host.endsWith("zoomgov.com")) return RECALL_PLATFORM.zoom;
  if (host === "meet.google.com") return RECALL_PLATFORM.googleMeet;
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return RECALL_PLATFORM.microsoftTeams;
  if (host.endsWith("webex.com")) return RECALL_PLATFORM.webex;
  return RECALL_PLATFORM.unknown;
}

export function buildBotConfig(opts: {
  meetingUrl: string;
  meetingId: string;
  publicUrl: string;
  joinAt?: string;
}) {
  const platform = detectPlatform(opts.meetingUrl);
  return {
    meeting_url: opts.meetingUrl,
    bot_name: BOT_NAME,
    // Omitted or <10 minutes away: ad-hoc bot from a shared pool (can 507).
    // 10+ minutes away: scheduled bot, guaranteed to join on time.
    join_at: opts.joinAt,
    // Values must be strings. Lets every webhook be routed back to our meeting row,
    // and lets two environments share one Recall workspace without stealing each other's events.
    metadata: { app_meeting_id: opts.meetingId },
    chat: {
      on_bot_join: {
        send_to: "everyone",
        message: CONSENT_MESSAGE,
        // Pinning is only supported on Google Meet.
        pin: platform === RECALL_PLATFORM.googleMeet,
      },
    },
    automatic_leave: {
      waiting_room_timeout: WAITING_ROOM_TIMEOUT_SECONDS,
      noone_joined_timeout: NOONE_JOINED_TIMEOUT_SECONDS,
    },
    recording_config: {
      transcript: {
        provider: {
          // The default mode (prioritize_accuracy) delays realtime events by 3-10 minutes.
          // Low latency is English-only; the accurate transcript comes from a post-call pass.
          recallai_streaming: { mode: "prioritize_low_latency", language_code: "en" },
        },
        // One audio stream per participant: speaker names come from the platform, not a guess.
        diarization: { use_separate_streams_when_available: true },
      },
      realtime_endpoints: [
        {
          type: "webhook",
          url: `${opts.publicUrl}${WEBHOOK_PATHS.realtime}`,
          events: [...REALTIME_EVENTS],
        },
      ],
      // Without an explicit value, newer workspaces keep media forever.
      retention: { type: "timed", hours: 168 },
    },
  };
}

/** Post-call transcription request. https://docs.recall.ai/docs/async-transcription */
export const ASYNC_TRANSCRIPT_CONFIG = {
  provider: { recallai_async: { language_code: "auto" } },
  diarization: { use_separate_streams_when_available: true },
};
