import { statusWebhookSchema } from "@/lib/recall/events";
import { ingestStatusWebhook } from "@/lib/meetings/service";
import { receiveRecallWebhook } from "@/lib/meetings/webhooks";

/**
 * Dashboard webhooks (delivered by Svix): bot.*, recording.*, transcript.*.
 * Configure in the Recall dashboard > Webhooks, pointing at /api/webhooks/recall.
 */

// Leaves room for the post-call LLM summary that runs in after().
export const maxDuration = 300;

export function POST(req: Request) {
  return receiveRecallWebhook(req, (body) => ingestStatusWebhook(statusWebhookSchema.parse(body)));
}
