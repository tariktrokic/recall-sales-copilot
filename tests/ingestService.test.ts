import { beforeEach, describe, expect, it, vi } from "vitest";
import { statusWebhookSchema } from "@/lib/recall/events";
import botRecording from "./fixtures/bot.in_call_recording.json";
import chatMessage from "./fixtures/realtime.chat_message.json";
import recordingDone from "./fixtures/recording.done.json";
import transcriptData from "./fixtures/realtime.transcript.data.json";
import postCallDone from "./fixtures/transcript.done.post_call.json";

const MEETING_ID = "11111111-1111-4111-8111-111111111111";

const repo = vi.hoisted(() => ({
  findMeetingForBot: vi.fn(),
  updateMeeting: vi.fn(),
  appendEvent: vi.fn(),
}));
const postCall = vi.hoisted(() => ({
  requestPostCallTranscript: vi.fn(),
  processPostCallTranscript: vi.fn(),
  fallbackToLiveTranscript: vi.fn(),
}));
const chat = vi.hoisted(() => ({ handleChatCommand: vi.fn() }));

vi.mock("@/lib/db/repository", () => repo);
vi.mock("@/lib/meetings/postCallService", () => postCall);
vi.mock("@/lib/meetings/chatService", () => chat);

const { ingestRealtimeEvent, ingestStatusWebhook } = await import("@/lib/meetings/ingestService");

const meeting = (overrides = {}) => ({
  id: MEETING_ID,
  botId: "6b9b9d3e-0c0c-4b9b-9a5e-3c3b0c2f1a11",
  platform: "google_meet",
  statusCode: "in_waiting_room",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findMeetingForBot.mockResolvedValue(meeting());
});

describe("ingestStatusWebhook", () => {
  it("updates the meeting status and logs a status event", async () => {
    const task = await ingestStatusWebhook(statusWebhookSchema.parse(botRecording));
    expect(task).toBeNull();
    expect(repo.updateMeeting).toHaveBeenCalledWith(MEETING_ID, { statusCode: "in_call_recording", subCode: null });
    expect(repo.appendEvent).toHaveBeenCalledWith(MEETING_ID, {
      type: "status",
      payload: { code: "in_call_recording", subCode: null, at: "2026-10-01T18:00:05.000Z" },
    });
  });

  it("does not move a finished meeting back to a live status when events arrive out of order", async () => {
    repo.findMeetingForBot.mockResolvedValue(meeting({ statusCode: "done" }));
    await ingestStatusWebhook(statusWebhookSchema.parse(botRecording));
    expect(repo.updateMeeting).not.toHaveBeenCalled();
    expect(repo.appendEvent).toHaveBeenCalledOnce();
  });

  it("ignores bots that belong to another app or environment", async () => {
    repo.findMeetingForBot.mockResolvedValue(null);
    expect(await ingestStatusWebhook(statusWebhookSchema.parse(botRecording))).toBeNull();
    expect(repo.appendEvent).not.toHaveBeenCalled();
  });

  it("starts post-call transcription once the recording is done", async () => {
    const task = await ingestStatusWebhook(statusWebhookSchema.parse(recordingDone));
    expect(repo.updateMeeting).toHaveBeenCalledWith(MEETING_ID, { recordingId: "rec_123" });
    await task!();
    expect(postCall.requestPostCallTranscript).toHaveBeenCalledWith(MEETING_ID, "rec_123");
  });

  it("processes only the transcript we tagged as post_call", async () => {
    const task = await ingestStatusWebhook(statusWebhookSchema.parse(postCallDone));
    await task!();
    expect(postCall.processPostCallTranscript).toHaveBeenCalledWith(MEETING_ID, "tr_post");

    const live = structuredClone(postCallDone);
    live.data.transcript.metadata = {} as typeof live.data.transcript.metadata;
    expect(await ingestStatusWebhook(statusWebhookSchema.parse(live))).toBeNull();
  });
});

describe("ingestRealtimeEvent", () => {
  it("stores final transcript lines as normalized segments", async () => {
    await ingestRealtimeEvent(transcriptData);
    expect(repo.appendEvent).toHaveBeenCalledWith(MEETING_ID, {
      type: "transcript.final",
      payload: {
        participantId: 200,
        name: "Pat Prospect",
        isHost: false,
        text: "How does pricing work?",
        startS: 12.1,
        endS: 13.2,
      },
    });
  });

  it("stores chat messages and returns a task for @copilot commands", async () => {
    const task = await ingestRealtimeEvent(chatMessage);
    expect(repo.appendEvent).toHaveBeenCalledWith(MEETING_ID, expect.objectContaining({ type: "chat.in" }));
    await task!();
    expect(chat.handleChatCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: MEETING_ID }),
      { kind: "note", text: "send the security whitepaper" },
      expect.objectContaining({ name: "Riley Rep" }),
    );
  });

  it("ignores the bot's own chat messages", async () => {
    const own = structuredClone(chatMessage);
    own.data.data.participant.name = "Sales Copilot";
    expect(await ingestRealtimeEvent(own)).toBeNull();
    expect(repo.appendEvent).not.toHaveBeenCalled();
  });
});
