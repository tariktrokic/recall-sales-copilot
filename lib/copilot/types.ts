import { APP_EVENT, type ArtifactKind, type InsightsSource, type PipelineStage, type TranscriptSource } from "@/lib/constants/events";
import type { SalesInsights } from "./insightsSchema";

/** Shared by server and browser. Every row in `meeting_events` is one of these. */

export type Speaker = { participantId: number; name: string; isHost: boolean };

/** One utterance: consecutive words from one speaker. Times are seconds since recording start. */
export type Segment = Speaker & { text: string; startS: number; endS: number };

export type PostCallTranscript = { segments: Segment[]; source: TranscriptSource };
export type InsightsResult = { insights: SalesInsights; generatedBy: InsightsSource; model: string };

export type MeetingEvent =
  | { type: typeof APP_EVENT.status; payload: { code: string; subCode: string | null; at: string; message?: string } }
  | { type: typeof APP_EVENT.artifact; payload: { kind: ArtifactKind; code: string; subCode: string | null; at: string } }
  | { type: typeof APP_EVENT.transcriptPartial; payload: Segment }
  | { type: typeof APP_EVENT.transcriptFinal; payload: Segment }
  | { type: typeof APP_EVENT.participantJoin; payload: Speaker & { at: string } }
  | { type: typeof APP_EVENT.participantLeave; payload: Speaker & { at: string } }
  | { type: typeof APP_EVENT.chatIn; payload: Speaker & { text: string; at: string } }
  | { type: typeof APP_EVENT.chatOut; payload: { text: string; at: string } }
  | { type: typeof APP_EVENT.note; payload: { text: string; by: string; at: string } }
  | { type: typeof APP_EVENT.postCallTranscript; payload: PostCallTranscript }
  | { type: typeof APP_EVENT.insightsReady; payload: InsightsResult }
  | { type: typeof APP_EVENT.pipelineError; payload: { stage: PipelineStage; message: string; at: string } };

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
