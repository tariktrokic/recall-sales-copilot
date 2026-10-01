"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "now" | "schedule";

/** Sends a bot now, or schedules one with join_at (scheduled bots are guaranteed to join on time). */
export function NewMeetingForm() {
  const router = useRouter();
  const [meetingUrl, setMeetingUrl] = useState("");
  const [mode, setMode] = useState<Mode>("now");
  const [joinAt, setJoinAt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingUrl: meetingUrl.trim(),
          joinAt: mode === "schedule" && joinAt ? new Date(joinAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      router.push(`/meetings/${data.meeting.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="meetingUrl" className="mb-1.5 block text-sm font-medium text-zinc-700">
          Meeting link
        </label>
        <input
          id="meetingUrl"
          type="url"
          required
          placeholder="https://meet.google.com/abc-defg-hij"
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        <p className="mt-1.5 text-xs text-zinc-500">Google Meet, Zoom, Microsoft Teams, or Webex.</p>
      </div>

      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="sr-only">When should the bot join?</legend>
        {(["now", "schedule"] as const).map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="accent-indigo-600" />
            {m === "now" ? "Join now" : "Schedule"}
          </label>
        ))}
        {mode === "schedule" && (
          <input
            type="datetime-local"
            required
            value={joinAt}
            onChange={(e) => setJoinAt(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
          />
        )}
      </fieldset>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Sending the bot… (up to a minute if Recall is busy)" : mode === "now" ? "Send Copilot to the call" : "Schedule Copilot"}
      </button>
    </form>
  );
}
