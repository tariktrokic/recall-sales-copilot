import { PIPELINE_STAGE, TRANSCRIPT_SOURCE, type PipelineStage } from "@/lib/constants/events";
import type { MeetingView } from "@/lib/copilot/view";

const STAGE_LABELS: Record<PipelineStage, string> = {
  [PIPELINE_STAGE.requestPostCallTranscript]: "Couldn't start post-call transcription",
  [PIPELINE_STAGE.processPostCallTranscript]: "Couldn't process the post-call transcript",
  [PIPELINE_STAGE.fallbackSummary]: "Couldn't generate the summary",
  [PIPELINE_STAGE.chatReply]: "Couldn't reply in the meeting chat",
};

const TRANSCRIPT_STAGES: ReadonlySet<string> = new Set([
  PIPELINE_STAGE.requestPostCallTranscript,
  PIPELINE_STAGE.processPostCallTranscript,
]);

/** Problems in background work. Transcript failures are warnings once the live-transcript fallback kicked in. */
export function PipelineErrors({ view }: { view: MeetingView }) {
  return view.errors.map((e) => {
    const recovered = TRANSCRIPT_STAGES.has(e.stage) && view.postCall?.source === TRANSCRIPT_SOURCE.live;
    return (
      <details
        key={e.at + e.stage}
        className={`rounded-lg px-4 py-2 text-sm ${recovered ? "bg-amber-50 text-amber-900" : "bg-rose-50 text-rose-800"}`}
      >
        <summary className="cursor-pointer">
          <span className="font-medium">{STAGE_LABELS[e.stage] ?? `${e.stage} failed`}</span>
          {recovered && " — the summary uses the live transcript instead."}
        </summary>
        <p className="mt-1 font-mono text-xs break-all opacity-80">{e.message}</p>
      </details>
    );
  });
}
