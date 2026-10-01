import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

let db: NeonHttpDatabase<typeof schema> | undefined;

/** Neon's HTTP driver: one stateless HTTPS round trip per query, which suits serverless functions. */
export function getDb(): NeonHttpDatabase<typeof schema> {
  db ??= drizzle(neon(env().DATABASE_URL), { schema });
  return db;
}
