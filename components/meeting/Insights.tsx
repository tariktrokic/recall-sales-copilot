"use client";

import { useState } from "react";
import { Card, Empty } from "@/components/ui";
import type { SalesInsights } from "@/lib/copilot/insightsSchema";
import { INSIGHTS_SOURCE } from "@/lib/constants/events";
import type { MeetingView } from "@/lib/copilot/view";

const SENTIMENT = {
  positive: "bg-emerald-100 text-emerald-800",
  neutral: "bg-zinc-100 text-zinc-700",
  negative: "bg-rose-100 text-rose-800",
} as const;

const QUALIFICATION_LABELS: Record<keyof SalesInsights["qualification"], string> = {
  metrics: "Metrics",
  economicBuyer: "Economic buyer",
  decisionProcess: "Decision process",
  timeline: "Timeline",
  competitors: "Competitors",
};

export function SummaryCard({ result }: { result: NonNullable<MeetingView["insights"]> }) {
  const { insights, generatedBy, model } = result;
  return (
    <Card
      title="Call summary"
      aside={
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SENTIMENT[insights.sentiment]}`}>
            {insights.sentiment}
          </span>
          <span className="text-xs text-zinc-400" title={model}>
            {generatedBy === INSIGHTS_SOURCE.llm ? "AI generated" : "Rule-based (no LLM configured)"}
          </span>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-zinc-800">{insights.summary}</p>
    </Card>
  );
}

export function InsightCards({ insights }: { insights: SalesInsights }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Pain points">
          <List items={insights.painPoints} empty="None identified." />
        </Card>
        <Card title="Objections">
          {insights.objections.length === 0 ? (
            <Empty>None raised.</Empty>
          ) : (
            <ul className="space-y-3 text-sm">
              {insights.objections.map((o, i) => (
                <li key={i}>
                  <p className="font-medium text-zinc-800">“{o.objection}”</p>
                  <p className="mt-0.5 text-zinc-500">{o.response ?? "Not addressed on the call."}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Next steps">
          {insights.nextSteps.length === 0 ? (
            <Empty>No next steps agreed.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {insights.nextSteps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <input type="checkbox" className="mt-1 accent-indigo-600" aria-label={s.action} />
                  <span>
                    {s.action}
                    <span className="block text-xs text-zinc-500">
                      {s.owner}
                      {s.due && ` · ${s.due}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Qualification">
          <dl className="space-y-2 text-sm">
            {(Object.keys(QUALIFICATION_LABELS) as (keyof SalesInsights["qualification"])[]).map((key) => (
              <div key={key} className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-zinc-500">{QUALIFICATION_LABELS[key]}</dt>
                <dd className={insights.qualification[key] ? "text-zinc-800" : "text-zinc-400"}>
                  {insights.qualification[key] ?? "Not covered"}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <FollowUpEmail email={insights.followUpEmail} />
    </div>
  );
}

function FollowUpEmail({ email }: { email: SalesInsights["followUpEmail"] }) {
  const [copied, setCopied] = useState(false);
  const mailto = `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  return (
    <Card
      title="Follow-up email draft"
      aside={
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(`${email.subject}\n\n${email.body}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <a href={mailto} className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500">
            Open in email
          </a>
        </div>
      }
    >
      <p className="text-sm font-medium">{email.subject}</p>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-zinc-700">{email.body}</p>
    </Card>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-800">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
