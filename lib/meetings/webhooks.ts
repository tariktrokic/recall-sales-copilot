import { after } from "next/server";
import { ZodError } from "zod";
import { env } from "@/lib/env";
import { verifyRecallRequest, WebhookVerificationError } from "@/lib/recall/verify";
import * as repo from "./repository";
import type { BackgroundTask } from "./service";

/**
 * Shared receive path for both Recall webhook routes:
 *
 *   verify signature -> dedupe on webhook-id -> store the event (synchronously) -> 200
 *   -> slow follow-up work (chat replies, transcription, LLM) in `after()`
 *
 * Storing synchronously keeps transcript lines in order even though consecutive webhooks
 * may be handled by different serverless instances.
 */
export async function receiveRecallWebhook(
  req: Request,
  ingest: (body: unknown) => Promise<BackgroundTask | null>,
): Promise<Response> {
  const rawBody = await req.text(); // must be the exact bytes Recall signed

  let webhookId: string;
  try {
    ({ webhookId } = verifyRecallRequest({ secret: env().RECALL_WEBHOOK_SECRET, headers: req.headers, rawBody }));
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }

  if (!(await repo.markWebhookProcessed(webhookId))) {
    return Response.json({ ok: true, duplicate: true });
  }

  let task: BackgroundTask | null;
  try {
    task = await ingest(body);
  } catch (err) {
    if (err instanceof ZodError) {
      // A payload shape we don't understand will never succeed on retry; acknowledge it.
      console.warn("Ignoring unrecognized Recall payload", webhookId, err.issues);
      return Response.json({ ok: true, ignored: true });
    }
    // Forget the id so Recall's retry gets processed, and answer 5xx so it does retry.
    await repo.unmarkWebhook(webhookId);
    console.error("Failed to ingest Recall webhook", webhookId, err);
    return Response.json({ error: "Failed to process webhook" }, { status: 500 });
  }

  if (task) {
    after(async () => {
      try {
        await task();
      } catch (err) {
        console.error("Background task failed for webhook", webhookId, err);
      }
    });
  }
  return Response.json({ ok: true });
}
