import { db, schema } from "@/lib/db"
import { and, eq } from "drizzle-orm"

/** The user's task row for a Hermes run id (null when it is not theirs). */
export async function ownedTask(userId: string, runId: string) {
  const [row] = await db
    .select()
    .from(schema.userTasks)
    .where(and(eq(schema.userTasks.userId, userId), eq(schema.userTasks.runId, runId)))
  return row ?? null
}
