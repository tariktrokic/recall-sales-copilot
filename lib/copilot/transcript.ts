import type { Segment } from "./types";

type WordLike = { text: string; start_timestamp: { relative: number }; end_timestamp?: { relative: number } | null };
type ParticipantLike = { id: number; name?: string | null; is_host?: boolean | null };

/** Turns Recall's word list (realtime event or downloaded transcript entry) into one segment. */
export function toSegment(participant: ParticipantLike, words: WordLike[]): Segment | null {
  if (words.length === 0) return null;
  const text = words
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
  if (!text) return null;
  const first = words[0];
  const last = words[words.length - 1];
  return {
    participantId: participant.id,
    name: participant.name?.trim() || `Participant ${participant.id}`,
    isHost: participant.is_host ?? false,
    text,
    startS: first.start_timestamp.relative,
    endS: last.end_timestamp?.relative ?? last.start_timestamp.relative,
  };
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Plain-text transcript for prompts and recaps. */
export function transcriptToText(segments: Segment[]): string {
  return segments.map((s) => `[${formatTimestamp(s.startS)}] ${s.name}: ${s.text}`).join("\n");
}
