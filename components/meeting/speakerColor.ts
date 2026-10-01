const PALETTE = [
  { text: "text-indigo-700", bar: "bg-indigo-500" },
  { text: "text-emerald-700", bar: "bg-emerald-500" },
  { text: "text-amber-700", bar: "bg-amber-500" },
  { text: "text-sky-700", bar: "bg-sky-500" },
  { text: "text-fuchsia-700", bar: "bg-fuchsia-500" },
  { text: "text-teal-700", bar: "bg-teal-500" },
];

/** Stable color per participant, so the same person looks the same in every panel. */
export function speakerColor(participantId: number) {
  return PALETTE[Math.abs(participantId) % PALETTE.length];
}
