import { beforeEach, describe, expect, it, vi } from "vitest";

const MEETING_ID = "11111111-1111-4111-8111-111111111111";

const recall = vi.hoisted(() => ({
  createAsyncTranscript: vi.fn(),
  getTranscript: vi.fn(),
  downloadJson: vi.fn(),
}));
const repo = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  updateMeeting: vi.fn(),
  getMeeting: vi.fn(),
  eventsOfType: vi.fn(),
  saveInsights: vi.fn(),
}));
const insights = vi.hoisted(() => ({ generateInsights: vi.fn() }));

vi.mock("@/lib/recall/client", () => recall);
vi.mock("@/lib/db/repository", () => repo);
vi.mock("@/lib/meetings/insightsService", () => insights);

const { processPostCallTranscript, requestPostCallTranscript } = await import("@/lib/meetings/postCallService");

const download = [
  {
    participant: { id: 1, name: "Riley Rep", is_host: true },
    language_code: "en",
    words: [
      { text: "Thanks", start_timestamp: { relative: 0.5, absolute: null }, end_timestamp: { relative: 0.9, absolute: null } },
      { text: "everyone.", start_timestamp: { relative: 0.9, absolute: null }, end_timestamp: { relative: 1.4, absolute: null } },
    ],
  },
];

const fakeInsights = { insights: { summary: "s" }, generatedBy: "llm", model: "gateway:openai/gpt-5-mini" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  repo.getMeeting.mockResolvedValue({ id: MEETING_ID, repParticipantId: null });
  repo.eventsOfType.mockResolvedValue([]);
  insights.generateInsights.mockResolvedValue(fakeInsights);
});

describe("post-call pipeline", () => {
  it("requests an async transcript tagged so its webhook can be recognized", async () => {
    recall.createAsyncTranscript.mockResolvedValue({ id: "tr_post" });
    await requestPostCallTranscript(MEETING_ID, "rec_1");
    expect(recall.createAsyncTranscript).toHaveBeenCalledWith(
      "rec_1",
      expect.objectContaining({ metadata: { kind: "post_call", app_meeting_id: MEETING_ID } }),
      { idempotencyKey: "post-call-rec_1" },
    );
    expect(repo.updateMeeting).toHaveBeenCalledWith(MEETING_ID, { asyncTranscriptId: "tr_post" });
  });

  it("downloads the accurate transcript, stores it, and generates insights", async () => {
    recall.getTranscript.mockResolvedValue({ id: "tr_post", data: { download_url: "https://s3.example/t.json" } });
    recall.downloadJson.mockResolvedValue(download);

    await processPostCallTranscript(MEETING_ID, "tr_post");

    expect(repo.appendEvent).toHaveBeenCalledWith(MEETING_ID, {
      type: "postcall.transcript",
      payload: {
        source: "post_call",
        segments: [{ participantId: 1, name: "Riley Rep", isHost: true, text: "Thanks everyone.", startS: 0.5, endS: 1.4 }],
      },
    });
    expect(insights.generateInsights).toHaveBeenCalledWith(expect.objectContaining({ repName: "Riley Rep" }));
    expect(repo.appendEvent).toHaveBeenCalledWith(MEETING_ID, { type: "insights.ready", payload: fakeInsights });
  });

  it("falls back to the live transcript when the post-call transcript can't be used", async () => {
    recall.getTranscript.mockRejectedValue(new Error("boom"));
    const live = { participantId: 2, name: "Pat", isHost: false, text: "Hi", startS: 0, endS: 1 };
    repo.eventsOfType.mockImplementation(async (_id: string, types: string[]) =>
      types.includes("transcript.final") ? [{ id: 1, type: "transcript.final", payload: live }] : [],
    );

    await processPostCallTranscript(MEETING_ID, "tr_post");

    expect(repo.appendEvent).toHaveBeenCalledWith(MEETING_ID, expect.objectContaining({ type: "pipeline.error" }));
    expect(repo.appendEvent).toHaveBeenCalledWith(MEETING_ID, {
      type: "postcall.transcript",
      payload: { segments: [live], source: "live" },
    });
    expect(repo.appendEvent).toHaveBeenCalledWith(MEETING_ID, { type: "insights.ready", payload: fakeInsights });
  });
});
