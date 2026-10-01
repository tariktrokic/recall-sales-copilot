import { z } from "zod";
import { getMeeting, toSummary, updateMeeting } from "@/lib/meetings/repository";

const patchSchema = z.object({ repParticipantId: z.number().int().nullable() });

/** Lets the user pick which participant is the sales rep (used for talk ratio and summaries). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/meetings/[id]">) {
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  await updateMeeting(id, { repParticipantId: parsed.data.repParticipantId });
  return Response.json({ meeting: toSummary({ ...meeting, ...parsed.data }) });
}
