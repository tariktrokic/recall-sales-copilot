"use client";

import { useMemo } from "react";
import { useMeetingEvents } from "@/hooks/useMeetingEvents";
import { prospectQuestions } from "@/lib/copilot/questions";
import { computeTalkTime, defaultRepId } from "@/lib/copilot/talkTime";
import { speakerLabels } from "@/lib/copilot/speakerLabels";
import type { MeetingSummary, StoredEvent } from "@/lib/copilot/types";
import type { MeetingView } from "@/lib/copilot/view";
import { ChatPanel } from "./ChatPanel";
import { LiveTranscript } from "./LiveTranscript";
import { MeetingHeader } from "./MeetingHeader";
import { OpenQuestions } from "./OpenQuestions";
import { PipelineErrors } from "./PipelineErrors";
import { PostCall } from "./PostCall";
import { StatusTimeline } from "./StatusTimeline";
import { TalkTimePanel } from "./TalkTimePanel";

const AFTER_CALL = new Set(["call_ended", "done", "fatal"]);

/** The whole meeting page. Everything on it is derived from the polled event log. */
export function MeetingDashboard({ initialMeeting, initialEvents }: { initialMeeting: MeetingSummary; initialEvents: StoredEvent[] }) {
  const { meeting, view: rawView, error, setMeeting } = useMeetingEvents(initialMeeting, initialEvents);
  const view = useMemo(() => withDistinctNames(rawView), [rawView]);

  // After the call, prefer the accurate post-call transcript for every panel.
  const segments = view.postCall?.segments ?? view.finals;
  const repId = meeting.repParticipantId ?? defaultRepId(segments) ?? defaultRepId(view.participants);
  const talkTime = useMemo(() => computeTalkTime(segments), [segments]);
  const questions = useMemo(() => prospectQuestions(segments, repId), [segments, repId]);
  const afterCall = AFTER_CALL.has(meeting.statusCode) || view.postCall !== null;

  async function chooseRep(participantId: number) {
    setMeeting({ repParticipantId: participantId });
    await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repParticipantId: participantId }),
    });
  }

  return (
    <div className="space-y-6">
      <MeetingHeader meeting={meeting} view={view} />

      {error && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Reconnecting… ({error})</p>
      )}
      <PipelineErrors view={view} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {afterCall ? (
            <PostCall meeting={meeting} view={view} />
          ) : (
            <LiveTranscript finals={view.finals} partials={view.partials} statusCode={meeting.statusCode} />
          )}
        </div>
        <aside className="space-y-6">
          <TalkTimePanel talkTime={talkTime} repId={repId} participants={view.participants} onChooseRep={chooseRep} />
          <OpenQuestions questions={questions} />
          <ChatPanel chat={view.chat} notes={view.notes} />
          <StatusTimeline statuses={view.statuses} artifacts={view.artifacts} />
        </aside>
      </div>
    </div>
  );
}

function withDistinctNames(view: MeetingView): MeetingView {
  const labels = speakerLabels([...view.participants, ...view.finals, ...(view.postCall?.segments ?? [])]);
  const relabel = <T extends { participantId: number; name: string }>(xs: T[]) =>
    xs.map((x) => ({ ...x, name: labels.get(x.participantId) ?? x.name }));
  return {
    ...view,
    finals: relabel(view.finals),
    partials: relabel(view.partials),
    participants: relabel(view.participants),
    postCall: view.postCall && { ...view.postCall, segments: relabel(view.postCall.segments) },
  };
}
