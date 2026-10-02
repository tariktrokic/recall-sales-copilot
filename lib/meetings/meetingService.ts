import { publicUrl } from "@/lib/env";
import { APP_EVENT } from "@/lib/constants/events";
import { APP_STATUS } from "@/lib/constants/status";
import { buildBotConfig, detectPlatform } from "@/lib/recall/botConfig";
import * as recall from "@/lib/recall/client";
import type { Meeting } from "@/lib/db/schema";
import * as repo from "@/lib/db/repository";

/** What the dashboard asks for: send a bot, remove it, play the recording. Called by API routes. */

const now = () => new Date().toISOString();

/** Creating a meeting = creating a bot. */
export async function createMeeting(input: { meetingUrl: string; joinAt: Date | null }): Promise<Meeting> {
  const origin = publicUrl(); // fail before writing anything if Recall couldn't reach us
  const meeting = await repo.insertMeeting({
    meetingUrl: input.meetingUrl,
    platform: detectPlatform(input.meetingUrl),
    joinAt: input.joinAt,
  });

  const config = buildBotConfig({
    meetingUrl: input.meetingUrl,
    meetingId: meeting.id,
    publicUrl: origin,
    joinAt: input.joinAt?.toISOString(),
  });

  try {
    // Our meeting id doubles as the idempotency key: a retried request can't create two bots.
    const bot = await recall.createBot(config, { idempotencyKey: meeting.id });
    const statusCode = input.joinAt ? APP_STATUS.scheduled : APP_STATUS.created;
    await repo.updateMeeting(meeting.id, { botId: bot.id, statusCode });
    await repo.appendEvent(meeting.id, { type: APP_EVENT.status, payload: { code: statusCode, subCode: null, at: now() } });
    return { ...meeting, botId: bot.id, statusCode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.updateMeeting(meeting.id, { statusCode: APP_STATUS.createFailed });
    await repo.appendEvent(meeting.id, {
      type: APP_EVENT.status,
      payload: { code: APP_STATUS.createFailed, subCode: null, at: now(), message },
    });
    throw err;
  }
}

export async function makeBotLeave(meeting: Meeting): Promise<void> {
  if (!meeting.botId) throw new Error("This meeting has no bot");
  await recall.leaveCall(meeting.botId);
}

/** Fresh signed URL on every call: Recall download URLs expire after a few hours. */
export async function getRecordingUrl(meeting: Meeting): Promise<string | null> {
  if (!meeting.botId) return null;
  const bot = await recall.getBot(meeting.botId);
  const recording = bot.recordings.find((r) => r.id === meeting.recordingId) ?? bot.recordings[0];
  return recording?.media_shortcuts?.video_mixed?.data?.download_url ?? null;
}
