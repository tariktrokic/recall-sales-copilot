import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import { env, llmBackend } from "@/lib/env";
import { salesInsightsSchema, type SalesInsights } from "./insightsSchema";
import { prospectQuestions } from "./questions";
import { computeTalkTime } from "./talkTime";
import { transcriptToText } from "./transcript";
import type { Segment } from "./types";

/**
 * LLM-backed summaries, with deterministic fallbacks so the app still works without a model.
 * Swap the prompts here to fit another sales methodology (BANT, SPICED, ...).
 */

type Note = { text: string; by: string };

const MAX_TRANSCRIPT_CHARS = 150_000;

function model(): { model: LanguageModel; id: string } | null {
  const backend = llmBackend();
  const id = env().AI_MODEL;
  if (backend === "openai") {
    const openai = createOpenAI({ apiKey: env().OPENAI_API_KEY });
    return { model: openai(id.replace(/^openai\//, "")), id };
  }
  // The AI SDK routes plain "provider/model" strings through the Vercel AI Gateway.
  if (backend === "gateway") return { model: id, id: `gateway:${id}` };
  return null;
}

function notesBlock(notes: Note[]): string {
  return notes.length ? notes.map((n) => `- ${n.text} (noted by ${n.by})`).join("\n") : "(none)";
}

// ---------------------------------------------------------------------------
// Live recap for `@copilot recap`
// ---------------------------------------------------------------------------

export async function generateRecap(segments: Segment[], notes: Note[]): Promise<string> {
  if (segments.length === 0) return "Nothing has been said yet.";
  const m = model();
  if (m) {
    try {
      const { text } = await generateText({
        model: m.model,
        system:
          "You recap live sales calls for the people in the call. Plain text only, no markdown. " +
          "At most 3 short sentences and under 400 characters total. Mention open questions if any.",
        prompt: `Notes taken so far:\n${notesBlock(notes)}\n\nTranscript so far:\n${transcriptToText(segments).slice(-20_000)}`,
      });
      return text.trim();
    } catch (err) {
      console.error("recap LLM call failed, using fallback", err);
    }
  }
  const lastLines = segments.slice(-3).map((s) => `${s.name}: ${s.text}`);
  return `Last few lines: ${lastLines.join(" / ")}${notes.length ? ` (${notes.length} notes saved)` : ""}`;
}

// ---------------------------------------------------------------------------
// Post-call insights
// ---------------------------------------------------------------------------

export async function generateInsights(input: {
  segments: Segment[];
  notes: Note[];
  repName: string | null;
}): Promise<{ insights: SalesInsights; generatedBy: "llm" | "rules"; model: string }> {
  const m = model();
  if (m && input.segments.length > 0) {
    try {
      const { output } = await generateText({
        model: m.model,
        output: Output.object({ schema: salesInsightsSchema }),
        system:
          "You are a sales operations assistant. Extract CRM-ready insights from a sales call transcript. " +
          "Only use facts stated in the transcript or notes; use null or empty arrays when the call did not cover something. " +
          `The seller (rep) is ${input.repName ?? "the meeting host"}. ` +
          "Write the follow-up email from the rep to the prospect: short, specific, answer or acknowledge their questions, confirm next steps.",
        prompt:
          `Notes the team saved during the call:\n${notesBlock(input.notes)}\n\n` +
          `Transcript:\n${transcriptToText(input.segments).slice(0, MAX_TRANSCRIPT_CHARS)}`,
      });
      return { insights: output, generatedBy: "llm", model: m.id };
    } catch (err) {
      console.error("insights LLM call failed, using fallback", err);
    }
  }
  return { insights: ruleBasedInsights(input), generatedBy: "rules", model: "rules" };
}

/** Deterministic summary used when no LLM is configured (or the call to it fails). */
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
