import { getMeeting } from "@/lib/meetings/repository";
import { getRecordingUrl } from "@/lib/meetings/service";

/** Returns a freshly signed video URL. Never store these: they expire after a few hours. */
export async function GET(_req: Request, ctx: RouteContext<"/api/meetings/[id]/media">) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });

  const videoUrl = await getRecordingUrl(meeting);
  return Response.json({ videoUrl }, { headers: { "Cache-Control": "no-store" } });
}
