"use client";

import { useEffect, useRef } from "react";
import { Card, Empty } from "@/components/ui";
import { formatTimestamp } from "@/lib/copilot/transcript";
import type { Segment } from "@/lib/copilot/types";
import { speakerColor } from "./speakerColor";

const WAITING_COPY: Record<string, string> = {
  created: "The bot is on its way.",
  scheduled: "The bot will join at the scheduled time.",
  joining_call: "The bot is joining the call…",
  in_waiting_room: "The bot is in the waiting room. Admit “Sales Copilot” to start.",
  in_call_not_recording: "The bot is in the call and about to start recording.",
};

export function LiveTranscript({ finals, partials, statusCode }: { finals: Segment[]; partials: Segment[]; statusCode: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [finals.length, partials]);

  return (
    <Card title="Live transcript" aside={<span className="text-xs text-zinc-400">{finals.length} lines</span>}>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="h-[60vh] space-y-3 overflow-y-auto pr-2"
      >
        {finals.length === 0 && partials.length === 0 && (
          <Empty>{WAITING_COPY[statusCode] ?? "Waiting for someone to speak…"}</Empty>
        )}
        {finals.map((s, i) => (
          <Line key={i} segment={s} />
        ))}
        {partials.map((s) => (
          <Line key={`partial-${s.participantId}`} segment={s} partial />
        ))}
      </div>
    </Card>
  );
}

function Line({ segment, partial }: { segment: Segment; partial?: boolean }) {
  return (
    <div className={partial ? "opacity-50" : undefined}>
      <p className="text-xs">
        <span className={`font-medium ${speakerColor(segment.participantId).text}`}>{segment.name}</span>
        <span className="ml-2 font-mono text-zinc-400">{formatTimestamp(segment.startS)}</span>
      </p>
      <p className="text-sm leading-relaxed text-zinc-800">
        {segment.text}
        {partial && "…"}
      </p>
    </div>
  );
}
