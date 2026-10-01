"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Renders a timestamp in the viewer's timezone (the server only knows UTC). */
export function LocalTime({ iso, options }: { iso: string; options?: Intl.DateTimeFormatOptions }) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  const date = new Date(iso);
  return (
    <time dateTime={iso}>
      {isClient ? date.toLocaleString(undefined, options ?? { dateStyle: "medium", timeStyle: "short" }) : ""}
    </time>
  );
}
