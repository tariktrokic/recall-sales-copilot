"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingSummary, StoredEvent } from "@/lib/copilot/types";
import { buildMeetingView, emptyView, type MeetingView } from "@/lib/copilot/view";

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
  if (typeof document !== "undefined" && document.hidden) return 5_000;
  if (meeting.statusCode === "scheduled") return 5_000;
  if (meeting.statusCode === "done" || meeting.statusCode === "call_ended") return 2_000; // post-call processing
  return 1_000;
}

export function useMeetingEvents(initialMeeting: MeetingSummary) {
  const [state, setState] = useState<MeetingState>({ meeting: initialMeeting, view: emptyView(), error: null });
  const cursor = useRef(0);
  const view = useRef<MeetingView>(emptyView());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const meetingId = initialMeeting.id;

  const poll = useCallback(async (): Promise<number | null> => {
    let meeting: MeetingSummary | undefined;
    let hasMore = true;
    while (hasMore) {
      const res = await fetch(`/api/meetings/${meetingId}/events?after=${cursor.current}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);
      const data = (await res.json()) as FeedResponse;
      if (data.events.length > 0) {
        view.current = buildMeetingView(data.events, view.current);
        cursor.current = data.events[data.events.length - 1].id;
      }
      meeting = data.meeting;
      hasMore = data.hasMore;
    }
    setState({ meeting: meeting!, view: view.current, error: null });
    return nextPollDelay(meeting!, view.current);
  }, [meetingId]);

  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      let delay: number | null;
      try {
        delay = await poll();
      } catch (err) {
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : "Connection problem" }));
        delay = 3_000;
      }
      if (!cancelled && delay !== null) timer.current = setTimeout(loop, delay);
    };
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [poll]);

  const setMeeting = useCallback((patch: Partial<MeetingSummary>) => {
    setState((s) => ({ ...s, meeting: { ...s.meeting, ...patch } }));
  }, []);

  return { ...state, setMeeting };
}
