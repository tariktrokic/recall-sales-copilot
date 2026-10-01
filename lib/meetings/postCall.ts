import { ASYNC_TRANSCRIPT_CONFIG } from "@/lib/recall/botConfig";
import * as recall from "@/lib/recall/client";
import { transcriptDownloadSchema } from "@/lib/recall/events";
import { generateInsights } from "@/lib/copilot/insights";
import { defaultRepId } from "@/lib/copilot/talkTime";
import { toSegment } from "@/lib/copilot/transcript";
import type { Segment } from "@/lib/copilot/types";
import * as repo from "./repository";

/**
 * The "hybrid transcript": during the call we stream a fast, English-only transcript.
 * Once the recording is done we ask Recall for an accurate async transcript of the same
 * recording and build the CRM summary from that. If anything in that path fails, the
 * live transcript is used instead so the user always gets a summary.
 */

const now = () => new Date().toISOString();

async function recordError(meetingId: string, stage: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[post-call] ${stage} failed for meeting ${meetingId}:`, message);
  await repo.appendEvent(meetingId, { type: "pipeline.error", payload: { stage, message, at: now() } });
}

/** Step 1 (on recording.done): start the accurate post-call transcription. */
export async function requestPostCallTranscript(meetingId: string, recordingId: string): Promise<void> {
  try {
    const transcript = await recall.createAsyncTranscript(
      recordingId,
      { ...ASYNC_TRANSCRIPT_CONFIG, metadata: { kind: "post_call", app_meeting_id: meetingId } },
      { idempotencyKey: `post-call-${recordingId}` },
    );
    await repo.updateMeeting(meetingId, { asyncTranscriptId: transcript.id });
  } catch (err) {
    await recordError(meetingId, "request_post_call_transcript", err);
    await fallbackToLiveTranscript(meetingId, "Could not start post-call transcription");
  }
}

/** Step 2 (on transcript.done for our post-call transcript): download, normalize, summarize. */
export async function processPostCallTranscript(meetingId: string, transcriptId: string): Promise<void> {
  try {
    const transcript = await recall.getTranscript(transcriptId);
    const url = transcript.data?.download_url;
    if (!url) throw new Error("Transcript has no download_url yet");
    const entries = transcriptDownloadSchema.parse(await recall.downloadJson(url));
    const segments = entries
      .map((e) => toSegment(e.participant, e.words))
      .filter((s): s is Segment => s !== null);
    if (segments.length === 0) throw new Error("Post-call transcript is empty");

    await repo.appendEvent(meetingId, { type: "postcall.transcript", payload: { segments, source: "post_call" } });
    await summarize(meetingId, segments);
  } catch (err) {
    await recordError(meetingId, "process_post_call_transcript", err);
    await fallbackToLiveTranscript(meetingId, "Post-call transcript unavailable");
  }
}

/** Builds the summary from the realtime transcript we already stored. */
export async function fallbackToLiveTranscript(meetingId: string, reason: string): Promise<void> {
  try {
    console.warn(`[post-call] meeting ${meetingId}: ${reason}; using the live transcript`);
    const finals = await repo.eventsOfType(meetingId, ["transcript.final"]);
    const segments = finals.map((e) => e.payload);
    await repo.appendEvent(meetingId, { type: "postcall.transcript", payload: { segments, source: "live" } });
    await summarize(meetingId, segments);
  } catch (err) {
    await recordError(meetingId, "fallback_summary", err);
  }
}

async function summarize(meetingId: string, segments: Segment[]): Promise<void> {
  const [meeting, notes] = await Promise.all([repo.getMeeting(meetingId), repo.eventsOfType(meetingId, ["note"])]);
  const repId = meeting?.repParticipantId ?? defaultRepId(segments);
  const repName = segments.find((s) => s.participantId === repId)?.name ?? null;

  const result = await generateInsights({ segments, notes: notes.map((n) => n.payload), repName });
  await repo.saveInsights(meetingId, result.insights, result.model);
  await repo.appendEvent(meetingId, { type: "insights.ready", payload: result });
}
