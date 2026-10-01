import type { SalesInsights } from "./insightsSchema";

/** Shared by server and browser. Every row in `meeting_events` is one of these. */

export type Speaker = { participantId: number; name: string; isHost: boolean };

/** One utterance: consecutive words from one speaker. Times are seconds since recording start. */
export type Segment = Speaker & { text: string; startS: number; endS: number };

export type MeetingEvent =
  | { type: "status"; payload: { code: string; subCode: string | null; at: string; message?: string } }
  | { type: "artifact"; payload: { kind: "recording" | "live_transcript" | "post_call_transcript"; code: string; subCode: string | null; at: string } }
  | { type: "transcript.partial"; payload: Segment }
  | { type: "transcript.final"; payload: Segment }
  | { type: "participant.join"; payload: Speaker & { at: string } }
  | { type: "participant.leave"; payload: Speaker & { at: string } }
  | { type: "chat.in"; payload: Speaker & { text: string; at: string } }
  | { type: "chat.out"; payload: { text: string; at: string } }
  | { type: "note"; payload: { text: string; by: string; at: string } }
  | { type: "postcall.transcript"; payload: { segments: Segment[]; source: "post_call" | "live" } }
  | { type: "insights.ready"; payload: { insights: SalesInsights; generatedBy: "llm" | "rules"; model: string } }
  | { type: "pipeline.error"; payload: { stage: string; message: string; at: string } };

export type MeetingEventType = MeetingEvent["type"];

export type StoredEvent = MeetingEvent & { id: number; createdAt: string };

/** Meeting fields the browser needs, as returned by the polling endpoint. */
export type MeetingSummary = {
  id: string;
  botId: string | null;
  meetingUrl: string;
  platform: string;
  joinAt: string | null;
  statusCode: string;
  subCode: string | null;
  repParticipantId: number | null;
  createdAt: string;
};
