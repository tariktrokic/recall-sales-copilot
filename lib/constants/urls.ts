/**
 * Every API path this app calls or exposes. Imported by browser code too, so it must stay
 * free of server-only imports.
 */

/**
 * Recall REST endpoints, relative to the regional base URL (`recallBaseUrl()`).
 * Every path keeps its trailing slash: Recall's routes require it.
 */
export const RECALL_API = {
  createBot: "/api/v1/bot/",
  bot: (botId: string) => `/api/v1/bot/${botId}/`,
  leaveCall: (botId: string) => `/api/v1/bot/${botId}/leave_call/`,
  sendChatMessage: (botId: string) => `/api/v1/bot/${botId}/send_chat_message/`,
  createTranscript: (recordingId: string) => `/api/v1/recording/${recordingId}/create_transcript/`,
  transcript: (transcriptId: string) => `/api/v1/transcript/${transcriptId}/`,
} as const;

/**
 * Our routes that Recall calls. No trailing slash: Next.js answers `/path/` with a 308 redirect.
 */
export const WEBHOOK_PATHS = {
  /** bot.*, recording.*, transcript.*; registered in the Recall dashboard. */
  status: "/api/webhooks/recall",
  /** Transcript and participant events; set per bot in `recording_config.realtime_endpoints`. */
  realtime: "/api/webhooks/recall/realtime",
} as const;

/** Our routes that the browser calls. */
export const APP_API = {
  meetings: "/api/meetings",
  meeting: (meetingId: string) => `/api/meetings/${meetingId}`,
  /** The polling feed: events with an id greater than `after`. */
  events: (meetingId: string, after: number) => `/api/meetings/${meetingId}/events?after=${after}`,
  leave: (meetingId: string) => `/api/meetings/${meetingId}/leave`,
  media: (meetingId: string) => `/api/meetings/${meetingId}/media`,
} as const;
