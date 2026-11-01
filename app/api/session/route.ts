import { getCurrentUser } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { activeSession, sessionKeyFor } from "@/lib/hermes/client"
import { listProfiles } from "@/lib/hermes/profiles"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

/** GET /api/session: the user's rolling session for the active persona (id, memory key, start, active project). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { profile, sessionId } = await activeSession(user)
  const [row] = await db
    .select({
      projectId: schema.userSessions.projectId,
      createdAt: schema.userSessions.createdAt,
      updatedAt: schema.userSessions.updatedAt,
    })
    .from(schema.userSessions)
    .where(and(eq(schema.userSessions.userId, user.id), eq(schema.userSessions.profile, profile)))

  return NextResponse.json({
    profile,
    profileLabel: listProfiles().find((p) => p.name === profile)?.label ?? profile,
    sessionKey: sessionKeyFor(user.username, profile),
    sessionId,
    projectId: row?.projectId ?? null,
    // updatedAt moves when the pointer is replaced, so it is when this session began.
    startedAt: row?.updatedAt ?? row?.createdAt ?? null,
  })
}
