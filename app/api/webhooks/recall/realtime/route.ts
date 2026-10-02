import { ingestRealtimeEvent } from "@/lib/meetings/ingestService";
import { receiveRecallWebhook } from "@/lib/webhooks/receiver";

/**
 * Realtime endpoint for transcript and participant events. Configured per bot in
 * recording_config.realtime_endpoints (see lib/recall/botConfig.ts), not in the dashboard.
 */

// Chat command replies (which may call the LLM for a recap) run in after().
export const maxDuration = 60;

export function POST(req: Request) {
  return receiveRecallWebhook(req, ingestRealtimeEvent);
}
