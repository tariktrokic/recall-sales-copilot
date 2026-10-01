import { LocalTime } from "@/components/LocalTime";
import { Card, Empty } from "@/components/ui";
import type { MeetingView } from "@/lib/copilot/view";
import { describeStatus } from "@/lib/recall/subCodes";

const ARTIFACT_LABELS: Record<string, string> = {
  recording: "Recording",
  live_transcript: "Live transcript",
  post_call_transcript: "Post-call transcript",
};

/** Raw bot lifecycle from Recall's status webhooks: handy when a bot misbehaves. */
export function StatusTimeline({ statuses, artifacts }: Pick<MeetingView, "statuses" | "artifacts">) {
  const rows = [
    ...statuses.map((s) => ({ at: s.at, label: describeStatus(s.code, s.subCode).label, detail: describeStatus(s.code, s.subCode).detail })),
    ...artifacts.map((a) => ({ at: a.at, label: `${ARTIFACT_LABELS[a.kind] ?? a.kind} ${a.code}`, detail: undefined })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Card title="Bot timeline">
      {rows.length === 0 ? (
        <Empty>No events yet.</Empty>
      ) : (
        <ol className="space-y-2 border-l border-zinc-200 pl-4">
          {rows.map((r, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-zinc-300" />
              <span className="mr-2 font-mono text-xs text-zinc-400">
                <LocalTime iso={r.at} options={{ timeStyle: "medium" }} />
              </span>
              {r.label}
              {r.detail && <span className="block text-xs text-zinc-500">{r.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
