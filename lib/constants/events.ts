/**
 * The app's own event vocabulary: what goes in `meeting_events.type` and the closed sets inside
 * payloads. The `MeetingEvent` union in `lib/copilot/types.ts` is built from these, so a value
 * changed here changes the type too. Values are stored in the database: renaming a value (not a
 * key) needs a data migration. Imported by browser code too.
 */

export const APP_EVENT = {
  status: "status",
  artifact: "artifact",
  transcriptPartial: "transcript.partial",
  transcriptFinal: "transcript.final",
  participantJoin: "participant.join",
  participantLeave: "participant.leave",
  chatIn: "chat.in",
  chatOut: "chat.out",
  note: "note",
  postCallTranscript: "postcall.transcript",
  insightsReady: "insights.ready",
  pipelineError: "pipeline.error",
} as const;

/** Which Recall artifact an `artifact` event reports on. */
export const ARTIFACT_KIND = {
  recording: "recording",
  liveTranscript: "live_transcript",
  postCallTranscript: "post_call_transcript",
} as const;

/** Which transcript the post-call summary was built from. */
export const TRANSCRIPT_SOURCE = {
  /** Recall's async transcript, requested after the call. */
  postCall: "post_call",
  /** Fallback: the low-latency transcript captured during the call. */
  live: "live",
} as const;

/** How the insights were produced. */
export const INSIGHTS_SOURCE = {
  llm: "llm",
  rules: "rules",
} as const;

/** The background step that failed, in a `pipeline.error` event. */
export const PIPELINE_STAGE = {
  requestPostCallTranscript: "request_post_call_transcript",
  processPostCallTranscript: "process_post_call_transcript",
  fallbackSummary: "fallback_summary",
  chatReply: "chat_reply",
} as const;

type ValueOf<T> = T[keyof T];
export type ArtifactKind = ValueOf<typeof ARTIFACT_KIND>;
export type TranscriptSource = ValueOf<typeof TRANSCRIPT_SOURCE>;
export type InsightsSource = ValueOf<typeof INSIGHTS_SOURCE>;
export type PipelineStage = ValueOf<typeof PIPELINE_STAGE>;
