"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Empty } from "@/components/ui";
import { formatTimestamp } from "@/lib/copilot/transcript";
import type { MeetingSummary, Segment } from "@/lib/copilot/types";
import type { MeetingView } from "@/lib/copilot/view";
import { InsightCards, SummaryCard } from "./Insights";
import { speakerColor } from "./speakerColor";

export function PostCall({ meeting, view }: { meeting: MeetingSummary; view: MeetingView }) {
  const video = useRef<HTMLVideoElement>(null);
  const [currentS, setCurrentS] = useState(0);
  const segments = view.postCall?.segments ?? view.finals;

  function seek(s: number) {
    if (!video.current) return;
    video.current.currentTime = s;
    void video.current.play();
  }

  return (
    <div className="space-y-6">
      {view.insights ? <SummaryCard result={view.insights} /> : <Progress meeting={meeting} view={view} />}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card title="Recording">
          <Recording meetingId={meeting.id} ready={meeting.statusCode === "done"} videoRef={video} onTime={setCurrentS} />
        </Card>
        <Card
          title="Transcript"
          aside={
            <span className="text-xs text-zinc-400">
              {view.postCall?.source === "post_call" ? "Post-call (accurate)" : "Live (low latency)"}
            </span>
          }
        >
          <Transcript segments={segments} currentS={currentS} onSeek={seek} />
        </Card>
      </div>

      {view.insights && <InsightCards insights={view.insights.insights} />}
    </div>
  );
}

function Progress({ meeting, view }: { meeting: MeetingSummary; view: MeetingView }) {
  const steps = [
    ["Call ended", true],
    ["Recording ready", meeting.statusCode === "done"],
    ["Accurate transcript", view.postCall !== null],
    ["Summary and follow-up", view.insights !== null],
  ] as const;
  return (
    <Card title="Wrapping up the call">
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {steps.map(([label, done]) => (
          <li key={label} className={`flex items-center gap-2 ${done ? "text-zinc-900" : "text-zinc-400"}`}>
            <span className={`grid size-4 place-items-center rounded-full text-[10px] ${done ? "bg-emerald-500 text-white" : "border border-zinc-300"}`}>
              {done && "✓"}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-zinc-500">
        Recall re-transcribes the recording for accuracy, then the summary is generated. This usually takes a minute or two.
      </p>
    </Card>
  );
}

type RecordingState = { status: "loading" } | { status: "ready"; url: string } | { status: "none" };

function Recording({
  meetingId,
  ready,
  videoRef,
  onTime,
}: {
  meetingId: string;
  ready: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTime: (s: number) => void;
}) {
  const [state, setState] = useState<RecordingState>({ status: "loading" });
  const retried = useRef(false);

  const load = useCallback(
    () =>
      fetch(`/api/meetings/${meetingId}/media`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { videoUrl: null }))
        .then((d: { videoUrl: string | null }) => setState(d.videoUrl ? { status: "ready", url: d.videoUrl } : { status: "none" }))
        .catch(() => setState({ status: "none" })),
    [meetingId],
  );

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return <Empty>Available once Recall finishes processing the media.</Empty>;
  if (state.status === "loading") return <Empty>Loading recording…</Empty>;
  if (state.status === "none") return <Empty>No recording for this call (simulated calls don&apos;t have one).</Empty>;

  return (
    <video
      ref={videoRef}
      src={state.url}
      controls
      preload="metadata"
      onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
      onError={() => {
        // Recall download URLs expire; fetch a freshly signed one once.
        if (retried.current) return;
        retried.current = true;
        void load();
      }}
      className="aspect-video w-full rounded-lg bg-black"
    />
  );
}

function Transcript({ segments, currentS, onSeek }: { segments: Segment[]; currentS: number; onSeek: (s: number) => void }) {
  if (segments.length === 0) return <Empty>Nobody spoke on this call.</Empty>;
  return (
    <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
      {segments.map((s, i) => {
        const active = currentS >= s.startS && currentS < s.endS;
        return (
          <li key={i}>
            <button
              onClick={() => onSeek(s.startS)}
              className={`w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-50 ${active ? "bg-indigo-50" : ""}`}
            >
              <span className="mr-2 font-mono text-xs text-zinc-400">{formatTimestamp(s.startS)}</span>
              <span className={`mr-1.5 text-xs font-medium ${speakerColor(s.participantId).text}`}>{s.name}</span>
              <span className="text-zinc-800">{s.text}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
