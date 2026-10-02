import { eventsAfter, getMeeting, toSummary } from "@/lib/db/repository";

const PAGE_SIZE = 500;

/**
 * The polling feed. The browser calls this about once a second with the id of the last
 * event it has, and receives everything newer plus the meeting's current state.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/meetings/[id]/events">) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });

  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  const events = await eventsAfter(id, Number.isFinite(after) ? after : 0, PAGE_SIZE);

  return Response.json(
    { meeting: toSummary(meeting), events, hasMore: events.length === PAGE_SIZE },
    { headers: { "Cache-Control": "no-store" } },
  );
}
