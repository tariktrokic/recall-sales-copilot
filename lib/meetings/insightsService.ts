import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import { env, llmBackend } from "@/lib/env";
import { INSIGHTS_SOURCE } from "@/lib/constants/events";
import { ruleBasedInsights, type Note } from "@/lib/copilot/insights";
import { salesInsightsSchema } from "@/lib/copilot/insightsSchema";
import { transcriptToText } from "@/lib/copilot/transcript";
import type { InsightsResult, Segment } from "@/lib/copilot/types";

/**
 * The LLM calls: the live `@copilot recap` and the post-call summary. Each falls back to the
 * deterministic version in `lib/copilot/insights.ts` when no model is configured or the call
 * fails, so the app always produces something. Swap the prompts here to fit another sales
 * methodology (BANT, SPICED, ...); the output shape is `salesInsightsSchema`.
 */

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

/** Live recap for `@copilot recap`. Short, because Google Meet caps chat messages at 500 characters. */
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

/** Post-call insights: one structured-output call that fills every field of `salesInsightsSchema`. */
export async function generateInsights(input: {
  segments: Segment[];
  notes: Note[];
  repName: string | null;
}): Promise<InsightsResult> {
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
      return { insights: output, generatedBy: INSIGHTS_SOURCE.llm, model: m.id };
    } catch (err) {
      console.error("insights LLM call failed, using fallback", err);
    }
  }
  return { insights: ruleBasedInsights(input), generatedBy: INSIGHTS_SOURCE.rules, model: INSIGHTS_SOURCE.rules };
}
