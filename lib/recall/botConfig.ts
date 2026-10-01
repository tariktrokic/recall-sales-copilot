/**
 * Everything about how the bot behaves lives here. This is the file to edit first when
 * adapting the app: bot name, consent message, transcription settings, which realtime
 * events to receive, and how long to wait in empty or locked meetings.
 *
 * Create Bot reference: https://docs.recall.ai/reference/bot_create
 */

export const BOT_NAME = "Sales Copilot";

export const CONSENT_MESSAGE =
  "Hi! I'm Sales Copilot, a notetaker for this call. This meeting is being recorded and transcribed. " +
  "Type @copilot help to see what I can do.";

export type Platform = "zoom" | "google_meet" | "microsoft_teams" | "webex" | "unknown";

export function detectPlatform(meetingUrl: string): Platform {
  let host: string;
  try {
    host = new URL(meetingUrl).hostname;
  } catch {
    return "unknown";
  }
  if (host.endsWith("zoom.us") || host.endsWith("zoomgov.com")) return "zoom";
  if (host === "meet.google.com") return "google_meet";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "microsoft_teams";
  if (host.endsWith("webex.com")) return "webex";
  return "unknown";
}

/** Realtime events this app consumes. Each one costs a webhook per occurrence, so keep it lean. */
export const REALTIME_EVENTS = [
  "transcript.data",
  "transcript.partial_data",
  "participant_events.join",
  "participant_events.leave",
  "participant_events.chat_message",
] as const;

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
        pin: platform === "google_meet",
      },
    },
    // Waiting-room and empty-room time is billed. Defaults are 20 minutes; a demo needs less.
    automatic_leave: {
      waiting_room_timeout: 600,
      noone_joined_timeout: 600,
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
          // No trailing slash: Next.js would answer it with a 308 redirect.
          url: `${opts.publicUrl}/api/webhooks/recall/realtime`,
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
