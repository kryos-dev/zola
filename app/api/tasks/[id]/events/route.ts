import { getCurrentUser } from "@/lib/auth"
import { openRunEvents } from "@/lib/hermes/runs"
import { ownedTask } from "@/lib/tasks-server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/tasks/{runId}/events: the run SSE, passed through unchanged. A
 * reconnect sends Last-Event-ID (or ?last_seq=) and Hermes replays what came
 * after it from its 1000-event backlog.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const task = await ownedTask(user.id, (await params).id)
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const lastEventId = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("last_seq")
  const upstream = await openRunEvents(task.profile, task.runId, lastEventId, req.signal).catch(() => null)
  if (!upstream?.body) return NextResponse.json({ error: "Run unavailable" }, { status: 502 })
  if (!upstream.ok) return new Response(upstream.body, { status: upstream.status })
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
