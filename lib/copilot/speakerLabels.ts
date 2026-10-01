/**
 * Display names that stay distinct when participants share a name: the same account joined
 * from two devices, or several anonymous guests all called "iPhone".
 */
export function speakerLabels(people: { participantId: number; name: string }[]): Map<number, string> {
  const ids = new Map<string, number[]>();
  for (const p of people) {
    const list = ids.get(p.name) ?? [];
    if (!list.includes(p.participantId)) list.push(p.participantId);
    ids.set(p.name, list);
  }
  const labels = new Map<number, string>();
  for (const [name, list] of ids) {
    list.sort((a, b) => a - b);
    list.forEach((id, i) => labels.set(id, list.length > 1 ? `${name} (${i + 1})` : name));
  }
  return labels;
}
