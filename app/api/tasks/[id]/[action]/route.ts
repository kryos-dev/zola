import { getCurrentUser } from "@/lib/auth"
import { controlRun } from "@/lib/hermes/runs"
import { ownedTask } from "@/lib/tasks-server"
import { NextResponse } from "next/server"

const ACTIONS = ["steer", "stop", "approval"] as const
type Action = (typeof ACTIONS)[number]

/** POST /api/tasks/{runId}/steer|stop|approval: forwarded to the Hermes run, response passed back. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, action } = await params
  if (!ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const task = await ownedTask(user.id, id)
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const res = await controlRun(task.profile, task.runId, action as Action, body).catch(() => null)
  if (!res) return NextResponse.json({ error: "Run unavailable" }, { status: 502 })
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  })
}
