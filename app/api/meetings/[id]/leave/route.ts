import { getMeeting } from "@/lib/db/repository";
import { makeBotLeave } from "@/lib/meetings/meetingService";

/** Asks the bot to leave. Recall then sends call_ended (sub-code bot_received_leave_call) and done. */
export async function POST(_req: Request, ctx: RouteContext<"/api/meetings/[id]/leave">) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });

  try {
    await makeBotLeave(meeting);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to leave" }, { status: 502 });
  }
}
