import type { SalesInsights } from "./insightsSchema";
import { prospectQuestions } from "./questions";
import { computeTalkTime } from "./talkTime";
import type { Segment } from "./types";

/**
 * The summary the app produces without a model, from talk time, detected questions, and the
 * notes saved in chat. The LLM version is in `lib/meetings/insightsService.ts`; this one is
 * its fallback, so the page is never empty.
 */

export type Note = { text: string; by: string };

export function ruleBasedInsights(input: { segments: Segment[]; notes: Note[]; repName: string | null }): SalesInsights {
  const talk = computeTalkTime(input.segments);
  const minutes = Math.round(input.segments.reduce((max, s) => Math.max(max, s.endS), 0) / 60);
  const speakers = talk.map((t) => `${t.name} ${Math.round(t.share * 100)}%`).join(", ");
  const repId = talk.find((t) => t.name === input.repName)?.participantId ?? null;
  const questions = prospectQuestions(input.segments, repId).map((q) => q.text);

  return {
    summary:
      `${minutes}-minute call with ${talk.length} speaker(s). Talk time: ${speakers || "n/a"}. ` +
      `${questions.length} question(s) from the prospect and ${input.notes.length} note(s) saved. ` +
      "Configure an LLM (see README) for a full AI summary.",
    painPoints: [],
    objections: [],
    nextSteps: input.notes.map((n) => ({ owner: n.by, action: n.text, due: null })),
    qualification: { metrics: null, economicBuyer: null, decisionProcess: null, timeline: null, competitors: null },
    sentiment: "neutral",
    followUpEmail: {
      subject: "Thanks for your time today",
      body: [
        "Hi,",
        "",
        "Thanks for the conversation today.",
        ...(questions.length ? ["", "You asked:", ...questions.slice(0, 5).map((q) => `- ${q}`), "I'll follow up on each of these."] : []),
        ...(input.notes.length ? ["", "Next steps:", ...input.notes.map((n) => `- ${n.text}`)] : []),
        "",
        "Best,",
        input.repName ?? "",
      ].join("\n"),
    },
  };
}
