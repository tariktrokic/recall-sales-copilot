import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "./client";
import { insights, meetingEvents, meetings, processedWebhooks, type Meeting } from "./schema";
import type { MeetingEvent, MeetingEventType, MeetingSummary, StoredEvent } from "@/lib/copilot/types";

/**
 * All database queries go through here; nothing outside `lib/db/` imports `getDb()`.
 *
 * - Another Postgres host: only `client.ts` changes (the Neon HTTP driver), because
 *   Drizzle's query builder is the same on every Postgres driver.
 * - Another SQL engine: `schema.ts` changes because its column types are Postgres-only
 *   (uuid, jsonb, bigserial), and this file changes because some queries are too
 *   (`make_interval` in `claimReplySlot`, `.returning()` with `onConflictDoNothing()`).
 * - Off Drizzle or SQL entirely: `lib/db/` is rewritten, and nothing else is, since
 *   callers only use functions like `appendEvent()` and never build queries.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function insertMeeting(values: { meetingUrl: string; platform: string; joinAt: Date | null }): Promise<Meeting> {
  const [row] = await getDb().insert(meetings).values(values).returning();
  return row;
}

export async function updateMeeting(id: string, patch: Partial<Omit<Meeting, "id" | "createdAt">>): Promise<void> {
  await getDb()
    .update(meetings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(meetings.id, id));
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  if (!UUID.test(id)) return null;
  const [row] = await getDb().select().from(meetings).where(eq(meetings.id, id));
  return row ?? null;
}

/**
 * Finds the meeting a Recall webhook belongs to. Prefers our own id from bot metadata;
 * events for bots created by another app or environment simply return null.
 */
export async function findMeetingForBot(bot: { id: string; metadata?: Record<string, unknown> | null } | null | undefined) {
  if (!bot) return null;
  const appId = bot.metadata?.app_meeting_id;
  if (typeof appId === "string") return getMeeting(appId);
  const [row] = await getDb().select().from(meetings).where(eq(meetings.botId, bot.id));
  return row ?? null;
}

export async function listMeetings(limit = 20): Promise<Meeting[]> {
  return getDb().select().from(meetings).orderBy(desc(meetings.createdAt)).limit(limit);
}

export async function appendEvent(meetingId: string, event: MeetingEvent): Promise<number> {
  const [row] = await getDb()
    .insert(meetingEvents)
    .values({ meetingId, type: event.type, payload: event.payload })
    .returning({ id: meetingEvents.id });
  return row.id;
}

export async function eventsAfter(meetingId: string, afterId: number, limit = 500): Promise<StoredEvent[]> {
  const rows = await getDb()
    .select()
    .from(meetingEvents)
    .where(and(eq(meetingEvents.meetingId, meetingId), gt(meetingEvents.id, afterId)))
    .orderBy(asc(meetingEvents.id))
    .limit(limit);
  return rows.map(toStoredEvent);
}

export async function eventsOfType<T extends MeetingEventType>(
  meetingId: string,
  types: T[],
): Promise<Extract<StoredEvent, { type: T }>[]> {
  const rows = await getDb()
    .select()
    .from(meetingEvents)
    .where(and(eq(meetingEvents.meetingId, meetingId), inArray(meetingEvents.type, types)))
    .orderBy(asc(meetingEvents.id));
  return rows.map(toStoredEvent) as Extract<StoredEvent, { type: T }>[];
}

function toStoredEvent(row: typeof meetingEvents.$inferSelect): StoredEvent {
  return { id: row.id, type: row.type, payload: row.payload, createdAt: row.createdAt.toISOString() } as StoredEvent;
}

/** Records a webhook id. Returns false if it was already seen (a retry of a delivered webhook). */
export async function markWebhookProcessed(webhookId: string): Promise<boolean> {
  const rows = await getDb()
    .insert(processedWebhooks)
    .values({ webhookId })
    .onConflictDoNothing()
    .returning({ webhookId: processedWebhooks.webhookId });
  return rows.length > 0;
}

/** Lets a webhook be retried after we failed to store it. */
export async function unmarkWebhook(webhookId: string): Promise<void> {
  await getDb().delete(processedWebhooks).where(eq(processedWebhooks.webhookId, webhookId));
}

/**
 * Atomic per-meeting rate limit for bot chat replies. In-memory counters don't work when
 * every webhook may run in a different serverless instance.
 */
export async function claimReplySlot(meetingId: string, intervalSeconds: number): Promise<boolean> {
  const rows = await getDb()
    .update(meetings)
    .set({ lastBotReplyAt: new Date() })
    .where(
      and(
        eq(meetings.id, meetingId),
        or(
          isNull(meetings.lastBotReplyAt),
          lt(meetings.lastBotReplyAt, sql`now() - make_interval(secs => ${intervalSeconds})`),
        ),
      ),
    )
    .returning({ id: meetings.id });
  return rows.length > 0;
}

export async function saveInsights(meetingId: string, data: unknown, model: string): Promise<void> {
  await getDb()
    .insert(insights)
    .values({ meetingId, data, model })
    .onConflictDoUpdate({ target: insights.meetingId, set: { data, model, createdAt: new Date() } });
}

export function toSummary(m: Meeting): MeetingSummary {
  return {
    id: m.id,
    botId: m.botId,
    meetingUrl: m.meetingUrl,
    platform: m.platform,
    joinAt: m.joinAt?.toISOString() ?? null,
    statusCode: m.statusCode,
    subCode: m.subCode,
    repParticipantId: m.repParticipantId,
    createdAt: m.createdAt.toISOString(),
  };
}
