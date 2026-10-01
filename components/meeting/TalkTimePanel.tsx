import { Card, Empty } from "@/components/ui";
import { formatTimestamp } from "@/lib/copilot/transcript";
import { repTalkNudge, type TalkTime } from "@/lib/copilot/talkTime";
import type { Speaker } from "@/lib/copilot/types";
import { speakerColor } from "./speakerColor";

type Props = {
  talkTime: TalkTime[];
  repId: number | null;
  participants: Speaker[];
  onChooseRep: (participantId: number) => void;
};

export function TalkTimePanel({ talkTime, repId, participants, onChooseRep }: Props) {
  const nudge = repTalkNudge(talkTime, repId);
  const people = participants.length > 0 ? participants : talkTime.map((t) => ({ participantId: t.participantId, name: t.name, isHost: false }));

  return (
    <Card
      title="Talk time"
      aside={
        people.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            Rep
            <select
              value={repId ?? ""}
              onChange={(e) => onChooseRep(Number(e.target.value))}
              className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs text-zinc-800"
            >
              {repId === null && <option value="">Choose…</option>}
              {people.map((p) => (
                <option key={p.participantId} value={p.participantId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )
      }
    >
      {talkTime.length === 0 ? (
        <Empty>Appears once people start talking.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {talkTime.map((t) => (
            <li key={t.participantId}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-zinc-700">
                  {t.name}
                  {t.participantId === repId && <span className="ml-1.5 text-zinc-400">(rep)</span>}
                </span>
                <span className="font-mono text-zinc-500">
                  {Math.round(t.share * 100)}% · {formatTimestamp(t.seconds)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className={`h-full rounded-full ${speakerColor(t.participantId).bar}`} style={{ width: `${t.share * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {nudge && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{nudge}</p>}
    </Card>
  );
}
