import { getCurrentUser } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { currentSession, sessionKeyFor } from "@/lib/hermes/client"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

/** GET /api/session: the user's rolling session (id, memory key, start, active project). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sessionId = await currentSession(user)
  const [row] = await db
    .select({
      projectId: schema.userSessions.projectId,
      createdAt: schema.userSessions.createdAt,
      updatedAt: schema.userSessions.updatedAt,
    })
    .from(schema.userSessions)
    .where(eq(schema.userSessions.userId, user.id))

  return NextResponse.json({
    sessionKey: sessionKeyFor(user.username),
    sessionId,
    projectId: row?.projectId ?? null,
    // updatedAt moves when the pointer is replaced, so it is when this session began.
    startedAt: row?.updatedAt ?? row?.createdAt ?? null,
  })
}
