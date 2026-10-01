import { Card, Empty } from "@/components/ui";
import type { ProspectQuestion } from "@/lib/copilot/questions";
import { formatTimestamp } from "@/lib/copilot/transcript";

export function OpenQuestions({ questions }: { questions: ProspectQuestion[] }) {
  return (
    <Card title="Prospect questions" aside={<span className="text-xs text-zinc-400">{questions.length}</span>}>
      {questions.length === 0 ? (
        <Empty>Questions from anyone but the rep show up here.</Empty>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {questions.map((q, i) => (
            <li key={i} className="text-sm">
              <span className="mr-2 font-mono text-xs text-zinc-400">{formatTimestamp(q.atS)}</span>
              {q.text}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
