import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MeetingDashboard } from "@/components/meeting/MeetingDashboard";
import { eventsAfter, getMeeting, toSummary } from "@/lib/meetings/repository";

export const metadata: Metadata = { title: "Call · Sales Call Copilot" };

export default async function MeetingPage({ params }: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) notFound();
  // First page of events is rendered on the server; the browser polls for the rest.
  const events = await eventsAfter(id, 0);
  return <MeetingDashboard initialMeeting={toSummary(meeting)} initialEvents={events} />;
}
