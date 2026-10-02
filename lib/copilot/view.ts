import { APP_EVENT, type ArtifactKind, type PipelineStage } from "@/lib/constants/events";
import type { InsightsResult, PostCallTranscript, Segment, Speaker, StoredEvent } from "./types";

export type ChatLine = { direction: "in" | "out"; name: string; text: string; at: string };

export type MeetingView = {
  statuses: { code: string; subCode: string | null; at: string; message?: string }[];
  finals: Segment[];
  /** In-progress utterance per participant, replaced once the final version arrives. */
  partials: Segment[];
  participants: (Speaker & { present: boolean })[];
  chat: ChatLine[];
  notes: { text: string; by: string; at: string }[];
  postCall: PostCallTranscript | null;
  insights: InsightsResult | null;
  errors: { stage: PipelineStage; message: string; at: string }[];
  artifacts: { kind: ArtifactKind; code: string; at: string }[];
};

export function emptyView(): MeetingView {
  return {
    statuses: [],
    finals: [],
    partials: [],
    participants: [],
    chat: [],
    notes: [],
    postCall: null,
    insights: null,
    errors: [],
    artifacts: [],
  };
}

/**
 * Folds the append-only event log into what the UI renders. Pure and incremental:
 * `buildMeetingView(newEvents, previousView)` gives the same result as replaying everything.
 */
export function buildMeetingView(events: StoredEvent[], previous: MeetingView = emptyView()): MeetingView {
  const view: MeetingView = {
    ...previous,
    statuses: [...previous.statuses],
    finals: [...previous.finals],
    chat: [...previous.chat],
    notes: [...previous.notes],
    errors: [...previous.errors],
    artifacts: [...previous.artifacts],
  };
  const partials = new Map(previous.partials.map((p) => [p.participantId, p]));
  const participants = new Map(previous.participants.map((p) => [p.participantId, p]));
  const seen = (s: Speaker, present?: boolean) => {
    const existing = participants.get(s.participantId);
    participants.set(s.participantId, {
      participantId: s.participantId,
      name: s.name,
      isHost: s.isHost || (existing?.isHost ?? false),
      present: present ?? existing?.present ?? true,
    });
  };

  for (const e of events) {
    switch (e.type) {
      case APP_EVENT.status:
        view.statuses.push(e.payload);
        break;
      case APP_EVENT.artifact:
        view.artifacts.push({ kind: e.payload.kind, code: e.payload.code, at: e.payload.at });
        break;
      case APP_EVENT.transcriptPartial:
        partials.set(e.payload.participantId, e.payload);
        seen(e.payload);
        break;
      case APP_EVENT.transcriptFinal:
        view.finals.push(e.payload);
        partials.delete(e.payload.participantId);
        seen(e.payload);
        break;
      case APP_EVENT.participantJoin:
        seen(e.payload, true);
        break;
      case APP_EVENT.participantLeave:
        seen(e.payload, false);
        break;
      case APP_EVENT.chatIn:
        view.chat.push({ direction: "in", name: e.payload.name, text: e.payload.text, at: e.payload.at });
        break;
      case APP_EVENT.chatOut:
        view.chat.push({ direction: "out", name: "Copilot", text: e.payload.text, at: e.payload.at });
        break;
      case APP_EVENT.note:
        view.notes.push(e.payload);
        break;
      case APP_EVENT.postCallTranscript:
        view.postCall = e.payload;
        break;
      case APP_EVENT.insightsReady:
        view.insights = e.payload;
        break;
      case APP_EVENT.pipelineError:
        view.errors.push(e.payload);
        break;
    }
  }

  view.partials = [...partials.values()];
  view.participants = [...participants.values()];
  return view;
}
