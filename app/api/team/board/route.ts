import { getCurrentUser } from "@/lib/auth"
import { isProfile } from "@/lib/hermes/profiles"
import { createCard, loadBoard, loadCard } from "@/lib/hermes/team"
import { NextResponse } from "next/server"

/** GET /api/team/board: Kanban cards by state plus the cards waiting on the user (with their last comment). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const board = await loadBoard()
  if (!board.ok) return NextResponse.json({ error: board.error }, { status: 502 })
  const waitingOnYou = await Promise.all(
    board.waitingOnYou.map(async (c) => {
      const d = await loadCard(c.id)
      const last = d.ok ? d.data.comments.at(-1) : undefined
      return { ...c, lastComment: last ? { author: last.author, body: last.body.slice(0, 300) } : null }
    })
  )
  return NextResponse.json({ columns: board.columns, waitingOnYou })
}

/** POST /api/team/board { title, assignee, body }: create a Kanban card for an agent. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof b.title === "string" ? b.title.trim() : ""
  const body = typeof b.body === "string" ? b.body : ""
  if (!title || typeof b.assignee !== "string" || !isProfile(b.assignee)) {
    return NextResponse.json({ error: "title and a known assignee are required" }, { status: 400 })
  }
  const res = await createCard({ title, assignee: b.assignee, body })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })
  return NextResponse.json({ id: res.data.task.id })
}
