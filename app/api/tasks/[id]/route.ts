import { getCurrentUser } from "@/lib/auth"
import { getRun } from "@/lib/hermes/runs"
import { ownedTask } from "@/lib/tasks-server"
import { NextResponse } from "next/server"

/** GET /api/tasks/{runId}: the pollable run status, the fallback once the event backlog has rolled over. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const task = await ownedTask(user.id, (await params).id)
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const run = await getRun(task.profile, task.runId)
  return NextResponse.json({
    id: task.runId,
    status: run?.status ?? task.status,
    output: run?.output ?? null,
    error: run?.error ?? null,
  })
}
