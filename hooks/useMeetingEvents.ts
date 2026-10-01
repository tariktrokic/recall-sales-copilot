"use client";

import { useCallback, useEffect, useState } from "react";
import type { MeetingSummary, StoredEvent } from "@/lib/copilot/types";
import { buildMeetingView, type MeetingView } from "@/lib/copilot/view";

type FeedResponse = { meeting: MeetingSummary; events: StoredEvent[]; hasMore: boolean };

export type MeetingState = { meeting: MeetingSummary; view: MeetingView; error: string | null };

/**
 * How often to poll, given what's happening. null stops polling.
 * Swapping polling for a push transport (Pusher, Ably, ...) only changes this hook.
 */
function nextPollDelay(meeting: MeetingSummary, view: MeetingView): number | null {
  if (view.insights || meeting.statusCode === "create_failed") return null;
  const everRecorded = view.statuses.some((s) => s.code === "in_call_recording");
  if (meeting.statusCode === "fatal" && !everRecorded) return null;
  if (document.hidden) return 5_000;
  if (meeting.statusCode === "scheduled") return 5_000;
  if (meeting.statusCode === "done" || meeting.statusCode === "call_ended") return 2_000; // post-call processing
  return 1_000;
}

/** Polls `GET /api/meetings/:id/events?after=<cursor>` and folds new events into a MeetingView. */
export function useMeetingEvents(initialMeeting: MeetingSummary, initialEvents: StoredEvent[] = []) {
  const [state, setState] = useState<MeetingState>(() => ({
    meeting: initialMeeting,
    view: buildMeetingView(initialEvents),
    error: null,
  }));
  const meetingId = initialMeeting.id;
  const [initial] = useState(initialEvents);

  useEffect(() => {
    // Cursor and view live in this closure, so a remount (or StrictMode's double effect)
    // starts a fresh loop instead of folding the same events in twice.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = initial.at(-1)?.id ?? 0;
    let view = buildMeetingView(initial);

    async function poll(): Promise<number | null> {
      let meeting: MeetingSummary | undefined;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(`/api/meetings/${meetingId}/events?after=${cursor}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Feed returned ${res.status}`);
        const data = (await res.json()) as FeedResponse;
        if (cancelled) return null;
        if (data.events.length > 0) {
          view = buildMeetingView(data.events, view);
          cursor = data.events[data.events.length - 1].id;
        }
        meeting = data.meeting;
        hasMore = data.hasMore;
      }
      setState({ meeting: meeting!, view, error: null });
      return nextPollDelay(meeting!, view);
    }

    async function loop() {
      let delay: number | null;
      try {
        delay = await poll();
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : "Connection problem" }));
        delay = 3_000;
      }
      if (!cancelled && delay !== null) timer = setTimeout(loop, delay);
    }

    void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [meetingId, initial]);

  const setMeeting = useCallback((patch: Partial<MeetingSummary>) => {
    setState((s) => ({ ...s, meeting: { ...s.meeting, ...patch } }));
  }, []);

  return { ...state, setMeeting };
}
