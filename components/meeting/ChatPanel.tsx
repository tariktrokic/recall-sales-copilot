import { Card } from "@/components/ui";
import type { ChatLine, MeetingView } from "@/lib/copilot/view";

export function ChatPanel({ chat, notes }: { chat: ChatLine[]; notes: MeetingView["notes"] }) {
  return (
    <Card title="Meeting chat">
      {chat.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Type <code className="rounded bg-zinc-100 px-1 text-xs">@copilot recap</code>,{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">@copilot note …</code>, or{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">@copilot help</code> in the meeting chat.
        </p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {chat.map((c, i) => (
            <li key={i} className={`rounded-lg px-3 py-2 text-sm ${c.direction === "out" ? "bg-indigo-50 text-indigo-900" : "bg-zinc-50"}`}>
              <span className="block text-xs font-medium text-zinc-500">{c.name}</span>
              {c.text}
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-1.5 text-xs font-medium text-zinc-500">Notes</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {notes.map((n, i) => (
              <li key={i}>{n.text}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
