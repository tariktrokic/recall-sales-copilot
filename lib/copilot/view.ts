import type { SalesInsights } from "./insightsSchema";
import type { Segment, Speaker, StoredEvent } from "./types";

export type ChatLine = { direction: "in" | "out"; name: string; text: string; at: string };

export type MeetingView = {
  statuses: { code: string; subCode: string | null; at: string; message?: string }[];
  finals: Segment[];
  /** In-progress utterance per participant, replaced once the final version arrives. */
  partials: Segment[];
  participants: (Speaker & { present: boolean })[];
  chat: ChatLine[];
  notes: { text: string; by: string; at: string }[];
  postCall: { segments: Segment[]; source: "post_call" | "live" } | null;
  insights: { insights: SalesInsights; generatedBy: "llm" | "rules"; model: string } | null;
  errors: { stage: string; message: string; at: string }[];
  artifacts: { kind: string; code: string; at: string }[];
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
      case "status":
        view.statuses.push(e.payload);
        break;
      case "artifact":
        view.artifacts.push({ kind: e.payload.kind, code: e.payload.code, at: e.payload.at });
        break;
      case "transcript.partial":
        partials.set(e.payload.participantId, e.payload);
        seen(e.payload);
        break;
      case "transcript.final":
        view.finals.push(e.payload);
        partials.delete(e.payload.participantId);
        seen(e.payload);
        break;
      case "participant.join":
        seen(e.payload, true);
        break;
      case "participant.leave":
        seen(e.payload, false);
        break;
      case "chat.in":
        view.chat.push({ direction: "in", name: e.payload.name, text: e.payload.text, at: e.payload.at });
        break;
      case "chat.out":
        view.chat.push({ direction: "out", name: "Copilot", text: e.payload.text, at: e.payload.at });
        break;
      case "note":
        view.notes.push(e.payload);
        break;
      case "postcall.transcript":
        view.postCall = e.payload;
        break;
      case "insights.ready":
        view.insights = e.payload;
        break;
      case "pipeline.error":
        view.errors.push(e.payload);
        break;
    }
  }

  view.partials = [...partials.values()];
  view.participants = [...participants.values()];
  return view;
}
