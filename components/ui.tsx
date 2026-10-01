import type { ReactNode } from "react";
import { describeStatus, statusTone, type Tone } from "@/lib/recall/subCodes";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700",
  waiting: "bg-amber-100 text-amber-800",
  live: "bg-red-100 text-red-700",
  success: "bg-emerald-100 text-emerald-800",
  error: "bg-rose-100 text-rose-800",
};

export function StatusBadge({ code }: { code: string }) {
  const tone = statusTone(code);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {tone === "live" && <span className="size-1.5 animate-pulse rounded-full bg-red-600" />}
      {describeStatus(code).label}
    </span>
  );
}

export function Card({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-xs ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-400">{children}</p>;
}

export const PLATFORM_LABELS: Record<string, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  microsoft_teams: "Microsoft Teams",
  webex: "Webex",
  unknown: "Meeting",
};
