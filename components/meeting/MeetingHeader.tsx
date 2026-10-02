"use client";

import { useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import { platformLabel, StatusBadge } from "@/components/ui";
import type { MeetingSummary } from "@/lib/copilot/types";
import type { MeetingView } from "@/lib/copilot/view";
import { IN_CALL_STATUSES } from "@/lib/constants/status";
import { describeStatus } from "@/lib/recall/subCodes";
import { APP_API } from "@/lib/constants/urls";

export function MeetingHeader({ meeting, view }: { meeting: MeetingSummary; view: MeetingView }) {
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const status = describeStatus(meeting.statusCode, meeting.subCode);
  const failure = view.statuses.findLast((s) => s.message)?.message;

  async function leave() {
    setLeaving(true);
    setLeaveError(null);
    const res = await fetch(APP_API.leave(meeting.id), { method: "POST" });
    if (!res.ok) {
      setLeaveError((await res.json().catch(() => null))?.error ?? "Could not remove the bot");
      setLeaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{platformLabel(meeting.platform) ?? "Meeting"} call</h1>
          <StatusBadge code={meeting.statusCode} />
        </div>
        <p className="truncate text-sm text-zinc-500">
          <a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className="hover:underline">
            {meeting.meetingUrl}
          </a>
          {meeting.joinAt && (
            <>
              {" · joins "}
              <LocalTime iso={meeting.joinAt} />
            </>
          )}
        </p>
        {(status.detail || failure) && (
          <p className="text-sm text-zinc-700">
            {status.detail ?? failure}
            {status.action && <span className="text-zinc-500"> {status.action}</span>}
          </p>
        )}
      </div>

      {IN_CALL_STATUSES.has(meeting.statusCode) && meeting.botId && (
        <div className="text-right">
          <button
            onClick={leave}
            disabled={leaving}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
          >
            {leaving ? "Leaving…" : "Remove bot from call"}
          </button>
          {leaveError && <p className="mt-1 text-xs text-rose-700">{leaveError}</p>}
        </div>
      )}
    </div>
  );
}
