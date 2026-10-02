"use client";

import { useCallback, useEffect, useState } from "react";
import type { MeetingSummary, StoredEvent } from "@/lib/copilot/types";
import { buildMeetingView, type MeetingView } from "@/lib/copilot/view";
import { RECALL_STATUS } from "@/lib/constants/recall";
import { APP_STATUS, WRAPPING_UP_STATUSES } from "@/lib/constants/status";
import { APP_API } from "@/lib/constants/urls";

type FeedResponse = { meeting: MeetingSummary; events: StoredEvent[]; hasMore: boolean };

export type MeetingState = { meeting: MeetingSummary; view: MeetingView; error: string | null };

/**
 * How often to poll, given what's happening. null stops polling.
 * Swapping polling for a push transport (Pusher, Ably, ...) only changes this hook.
 */
function nextPollDelay(meeting: MeetingSummary, view: MeetingView): number | null {
  if (view.insights || meeting.statusCode === APP_STATUS.createFailed) return null;
  const everRecorded = view.statuses.some((s) => s.code === RECALL_STATUS.inCallRecording);
  if (meeting.statusCode === RECALL_STATUS.fatal && !everRecorded) return null;
  if (document.hidden) return 5_000;
  if (meeting.statusCode === APP_STATUS.scheduled) return 5_000;
  if (WRAPPING_UP_STATUSES.has(meeting.statusCode)) return 2_000;
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
        const res = await fetch(APP_API.events(meetingId, cursor), { cache: "no-store" });
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
