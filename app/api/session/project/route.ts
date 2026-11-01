import { getCurrentUser } from "@/lib/auth"
import { ownsProject } from "@/lib/auth/guards"
import { db, schema } from "@/lib/db"
import { currentSession } from "@/lib/hermes/client"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

/** PATCH /api/session/project { projectId: string | null }: the project whose instructions apply to later turns. */
export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = (await request.json().catch(() => ({}))) as {
    projectId?: string | null
  }
  if (projectId !== null && typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId must be a string or null" }, { status: 400 })
  }
  if (projectId && !(await ownsProject(projectId, user.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  await currentSession(user) // make sure the row exists
  await db
    .update(schema.userSessions)
    .set({ projectId })
    .where(eq(schema.userSessions.userId, user.id))
  return NextResponse.json({ projectId })
}
