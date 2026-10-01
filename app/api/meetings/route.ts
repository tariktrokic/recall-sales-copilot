import { z } from "zod";
import { RecallApiError } from "@/lib/recall/client";
import { createMeeting } from "@/lib/meetings/service";
import { listMeetings, toSummary } from "@/lib/meetings/repository";

// Creating an ad-hoc bot can wait ~30s per retry when Recall's warm pool is empty (507).
export const maxDuration = 120;

const createSchema = z.object({
  meetingUrl: z.url({ protocol: /^https$/, error: "Paste the full https:// meeting link" }),
  joinAt: z.iso
    .datetime({ offset: true })
    .optional()
    .refine((v) => !v || new Date(v).getTime() > Date.now(), "Join time must be in the future"),
});

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  try {
    const meeting = await createMeeting({
      meetingUrl: parsed.data.meetingUrl,
      joinAt: parsed.data.joinAt ? new Date(parsed.data.joinAt) : null,
    });
    return Response.json({ meeting: toSummary(meeting) }, { status: 201 });
  } catch (err) {
    console.error("Failed to create bot", err);
    const status = err instanceof RecallApiError && err.status < 500 ? 422 : 502;
    return Response.json({ error: err instanceof Error ? err.message : "Failed to create bot" }, { status });
  }
}

export async function GET() {
  const meetings = await listMeetings();
  return Response.json({ meetings: meetings.map(toSummary) });
}
