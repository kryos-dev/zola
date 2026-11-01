import { getCurrentUser } from "@/lib/auth"
import { currentSession, activeProfile } from "@/lib/hermes/client"
import { isProfile } from "@/lib/hermes/profiles"
import { createRun, getRun } from "@/lib/hermes/runs"
import { db, schema } from "@/lib/db"
import { TERMINAL_STATUSES, titleFrom } from "@/lib/tasks"
import { and, desc, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"

/** POST /api/tasks {text, profile?}: starts a detached Hermes run on the persona rolling session. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { text?: string; profile?: string }
  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 })
  const profile = body.profile && isProfile(body.profile) ? body.profile : await activeProfile(user.id)

  try {
    const runId = await createRun({
      profile,
      username: user.username,
      sessionId: await currentSession(user, profile),
      text,
      idempotencyKey: request.headers.get("Idempotency-Key") || crypto.randomUUID(),
    })
    const title = titleFrom(text)
    await db
      .insert(schema.userTasks)
      .values({ userId: user.id, profile, runId, title })
      .onConflictDoNothing()
    return NextResponse.json({ runId, profile, title }, { status: 201 })
  } catch (err) {
    console.error("Error in POST /api/tasks:", err)
    return NextResponse.json({ error: "Could not start the task" }, { status: 502 })
  }
}

/** GET /api/tasks: the newest 30 tasks of the user with their live Hermes status. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await db
    .select()
    .from(schema.userTasks)
    .where(eq(schema.userTasks.userId, user.id))
    .orderBy(desc(schema.userTasks.createdAt))
    .limit(30)

  // Terminal statuses are cached on the row; only unfinished runs ask Hermes.
  // When Hermes no longer knows a run (404) or is unreachable, the last known
  // status stays.
  const tasks = await Promise.all(
    rows.map(async (r) => {
      if (TERMINAL_STATUSES.includes(r.status)) return r
      const run = await getRun(r.profile, r.runId)
      return { ...r, status: run?.status ?? r.status }
    })
  )
  const finished = tasks.filter(
    (t, i) => t.status !== rows[i].status && TERMINAL_STATUSES.includes(t.status)
  )
  for (const status of new Set(finished.map((t) => t.status))) {
    await db
      .update(schema.userTasks)
      .set({ status })
      .where(
        and(
          eq(schema.userTasks.userId, user.id),
          inArray(
            schema.userTasks.runId,
            finished.filter((t) => t.status === status).map((t) => t.runId)
          )
        )
      )
  }
  return NextResponse.json({ tasks })
}
