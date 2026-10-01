import type { Segment } from "./types";

export type TalkTime = { participantId: number; name: string; seconds: number; share: number };

/** Seconds spoken per participant, from final transcript segments. Sorted by most talkative. */
export function computeTalkTime(segments: Segment[]): TalkTime[] {
  const byParticipant = new Map<number, { name: string; seconds: number }>();
  for (const s of segments) {
    const entry = byParticipant.get(s.participantId) ?? { name: s.name, seconds: 0 };
    entry.seconds += Math.max(0, s.endS - s.startS);
    entry.name = s.name;
    byParticipant.set(s.participantId, entry);
  }
  const total = [...byParticipant.values()].reduce((sum, p) => sum + p.seconds, 0);
  return [...byParticipant.entries()]
    .map(([participantId, p]) => ({
      participantId,
      name: p.name,
      seconds: p.seconds,
      share: total > 0 ? p.seconds / total : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** Coaching rule of thumb: top reps listen more than they talk. */
export const REP_TALK_SHARE_LIMIT = 0.65;
/** Don't nudge on the first few sentences of a call. */
export const MIN_SECONDS_BEFORE_NUDGE = 60;

export function repTalkNudge(talkTime: TalkTime[], repParticipantId: number | null): string | null {
  if (repParticipantId === null) return null;
  const total = talkTime.reduce((sum, t) => sum + t.seconds, 0);
  const rep = talkTime.find((t) => t.participantId === repParticipantId);
  if (!rep || total < MIN_SECONDS_BEFORE_NUDGE || rep.share <= REP_TALK_SHARE_LIMIT) return null;
  return `${rep.name} has talked ${Math.round(rep.share * 100)}% of the time. Try an open question and let the prospect talk.`;
}

/** The rep defaults to the host, which is usually whoever sent the invite. */
export function defaultRepId(segments: { participantId: number; isHost: boolean }[]): number | null {
  return segments.find((s) => s.isHost)?.participantId ?? null;
}
