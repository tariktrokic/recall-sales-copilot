import type { Segment } from "./types";

const QUESTION_STARTERS =
  /^(what|how|why|when|where|who|which|can|could|do|does|did|is|are|will|would|should|have|has)\b/i;

/** Low-latency transcription doesn't always punctuate, so also look at how the sentence starts. */
export function isQuestion(sentence: string): boolean {
  const s = sentence.trim();
  if (s.length < 8) return false;
  return s.endsWith("?") || (QUESTION_STARTERS.test(s) && s.split(/\s+/).length >= 4);
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

export type ProspectQuestion = { participantId: number; name: string; text: string; atS: number };

/** Questions asked by anyone other than the rep: the things the follow-up must answer. */
export function prospectQuestions(segments: Segment[], repParticipantId: number | null): ProspectQuestion[] {
  const questions: ProspectQuestion[] = [];
  for (const s of segments) {
    if (s.participantId === repParticipantId) continue;
    for (const sentence of splitSentences(s.text)) {
      if (isQuestion(sentence)) {
        questions.push({ participantId: s.participantId, name: s.name, text: sentence, atS: s.startS });
      }
    }
  }
  return questions;
}
