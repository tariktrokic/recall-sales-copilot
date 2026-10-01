import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { signRecallPayload } from "@/lib/recall/verify";
import botRecording from "./fixtures/bot.in_call_recording.json";

const SECRET = `whsec_${Buffer.from("webhook-test-secret").toString("base64")}`;

const repo = vi.hoisted(() => ({
  markWebhookProcessed: vi.fn(),
  unmarkWebhook: vi.fn(),
}));
const afterCallbacks = vi.hoisted(() => [] as (() => Promise<void>)[]);

vi.mock("@/lib/meetings/repository", () => repo);
vi.mock("next/server", () => ({ after: (cb: () => Promise<void>) => afterCallbacks.push(cb) }));

const { receiveRecallWebhook } = await import("@/lib/meetings/webhooks");

function signedRequest(body: string, headers = signRecallPayload(SECRET, body, { id: "msg_1" })) {
  return new Request("https://app.example.com/api/webhooks/recall", { method: "POST", body, headers });
}

beforeEach(() => {
  vi.stubEnv("RECALL_API_KEY", "k");
  vi.stubEnv("RECALL_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("DATABASE_URL", "postgres://example");
  repo.markWebhookProcessed.mockReset().mockResolvedValue(true);
  repo.unmarkWebhook.mockReset().mockResolvedValue(undefined);
  afterCallbacks.length = 0;
});

describe("receiveRecallWebhook", () => {
  const body = JSON.stringify(botRecording);

  it("rejects unsigned or forged requests with 401 before touching the database", async () => {
    const ingest = vi.fn();
    const res = await receiveRecallWebhook(
      signedRequest(body, signRecallPayload(`whsec_${Buffer.from("wrong").toString("base64")}`, body)),
      ingest,
    );
    expect(res.status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
    expect(repo.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it("ingests a verified webhook and schedules its background task after the response", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const ingest = vi.fn().mockResolvedValue(task);

    const res = await receiveRecallWebhook(signedRequest(body), ingest);

    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledWith(botRecording);
    expect(task).not.toHaveBeenCalled();
    await afterCallbacks[0]();
    expect(task).toHaveBeenCalledOnce();
  });

  it("acknowledges duplicates (Svix retries) without ingesting them again", async () => {
    repo.markWebhookProcessed.mockResolvedValue(false);
    const ingest = vi.fn();
    const res = await receiveRecallWebhook(signedRequest(body), ingest);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("returns 500 and forgets the webhook id when storing fails, so Recall retries", async () => {
    const ingest = vi.fn().mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await receiveRecallWebhook(signedRequest(body), ingest);
    expect(res.status).toBe(500);
    expect(repo.unmarkWebhook).toHaveBeenCalledWith("msg_1");
  });

  it("acknowledges payloads it can't parse instead of triggering endless retries", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ingest = vi.fn().mockImplementation(async () => z.object({ nope: z.string() }).parse({}));
    const res = await receiveRecallWebhook(signedRequest(body), ingest);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
  });
});
