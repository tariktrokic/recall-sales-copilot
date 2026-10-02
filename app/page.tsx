import Link from "next/link";
import { connection } from "next/server";
import { LocalTime } from "@/components/LocalTime";
import { NewMeetingForm } from "@/components/NewMeetingForm";
import { Card, Empty, platformLabel, StatusBadge } from "@/components/ui";
import { listMeetings } from "@/lib/db/repository";

const FEATURES = [
  ["Live transcript", "Low-latency streaming transcription with per-speaker diarization."],
  ["Talk-time coaching", "See who's talking and get nudged when the rep talks too much."],
  ["Open questions", "Every question the prospect asks, so none go unanswered."],
  ["@copilot in chat", "Type @copilot recap or @copilot note … in the meeting chat."],
  ["Post-call summary", "Pain points, objections, MEDDIC fields, and a follow-up email draft."],
  ["Plain-English bot status", "Every Recall status and sub-code explained, with what to do next."],
];

export default async function Home() {
  await connection();
  const meetings = await listMeetings();

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your AI sidekick for sales calls</h1>
          <p className="mt-2 max-w-xl text-zinc-600">
            Paste a meeting link and a Recall.ai bot joins the call. You get a live transcript and coaching while
            you talk, then a recording and a CRM-ready summary when the call ends.
          </p>
        </div>

        <Card>
          <NewMeetingForm />
          <p className="mt-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            The bot announces itself in the meeting chat so everyone knows the call is being recorded.
          </p>
        </Card>

        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map(([title, body]) => (
            <li key={title} className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-sm text-zinc-500">{body}</p>
            </li>
          ))}
        </ul>
      </div>

      <Card title="Recent calls">
        {meetings.length === 0 ? (
          <Empty>No calls yet. Send the bot to one, or run `npm run simulate`.</Empty>
        ) : (
          <ul className="-mx-2 divide-y divide-zinc-100">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link href={`/meetings/${m.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{platformLabel(m.platform) ?? m.platform}</p>
                    <p className="truncate text-xs text-zinc-500">
                      <LocalTime iso={(m.joinAt ?? m.createdAt).toISOString()} />
                      {" · "}
                      {m.meetingUrl.replace(/^https:\/\//, "")}
                    </p>
                  </div>
                  <StatusBadge code={m.statusCode} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
