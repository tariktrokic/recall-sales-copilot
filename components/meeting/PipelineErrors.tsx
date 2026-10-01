import type { MeetingView } from "@/lib/copilot/view";

const STAGE_LABELS: Record<string, string> = {
  request_post_call_transcript: "Couldn't start post-call transcription",
  process_post_call_transcript: "Couldn't process the post-call transcript",
  fallback_summary: "Couldn't generate the summary",
  chat_reply: "Couldn't reply in the meeting chat",
};

const TRANSCRIPT_STAGES = new Set(["request_post_call_transcript", "process_post_call_transcript"]);

/** Problems in background work. Transcript failures are warnings once the live-transcript fallback kicked in. */
export function PipelineErrors({ view }: { view: MeetingView }) {
  return view.errors.map((e) => {
    const recovered = TRANSCRIPT_STAGES.has(e.stage) && view.postCall?.source === "live";
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
