import { getMeeting } from "@/lib/meetings/repository";
import { getRecordingUrl } from "@/lib/meetings/service";
import { RecallApiError } from "@/lib/recall/client";

/** Returns a freshly signed video URL. Never store these: they expire after a few hours. */
export async function GET(_req: Request, ctx: RouteContext<"/api/meetings/[id]/media">) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });

  try {
    const videoUrl = await getRecordingUrl(meeting);
    return Response.json({ videoUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // 404: simulated meeting, or the bot's media was deleted after its retention period.
    if (err instanceof RecallApiError && err.status === 404) return Response.json({ videoUrl: null });
    throw err;
  }
}
