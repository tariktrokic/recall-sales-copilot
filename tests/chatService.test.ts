import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "@/lib/db/schema";

const recall = vi.hoisted(() => ({ sendChatMessage: vi.fn() }));
const repo = vi.hoisted(() => ({ appendEvent: vi.fn(), claimReplySlot: vi.fn(), eventsOfType: vi.fn() }));
const insights = vi.hoisted(() => ({ generateRecap: vi.fn() }));

vi.mock("@/lib/recall/client", () => recall);
vi.mock("@/lib/db/repository", () => repo);
vi.mock("@/lib/meetings/insightsService", () => insights);

const { handleChatCommand } = await import("@/lib/meetings/chatService");

const meeting = { id: "m1", botId: "bot_1", platform: "google_meet" } as Meeting;
const from = { participantId: 1, name: "Riley Rep", isHost: true };

beforeEach(() => {
  vi.clearAllMocks();
  repo.claimReplySlot.mockResolvedValue(true);
  repo.eventsOfType.mockResolvedValue([]);
});

describe("handleChatCommand", () => {
  it("saves notes and confirms them in the chat", async () => {
    await handleChatCommand(meeting, { kind: "note", text: "send pricing" }, from);
    expect(repo.appendEvent).toHaveBeenCalledWith("m1", {
      type: "note",
      payload: expect.objectContaining({ text: "send pricing", by: "Riley Rep" }),
    });
    expect(recall.sendChatMessage).toHaveBeenCalledWith("bot_1", { message: expect.stringContaining("send pricing") });
    expect(repo.appendEvent).toHaveBeenCalledWith("m1", expect.objectContaining({ type: "chat.out" }));
  });

  it("still saves the note but stays quiet when rate-limited", async () => {
    repo.claimReplySlot.mockResolvedValue(false);
    await handleChatCommand(meeting, { kind: "note", text: "x" }, from);
    expect(repo.appendEvent).toHaveBeenCalledOnce();
    expect(recall.sendChatMessage).not.toHaveBeenCalled();
  });

  it("keeps recaps within Google Meet's 500-character chat limit", async () => {
    insights.generateRecap.mockResolvedValue("word ".repeat(200));
    await handleChatCommand(meeting, { kind: "recap" }, from);
    const { message } = recall.sendChatMessage.mock.calls[0][1];
    expect(message.length).toBeLessThanOrEqual(500);
    expect(message.startsWith("Copilot:")).toBe(true);
  });
});
