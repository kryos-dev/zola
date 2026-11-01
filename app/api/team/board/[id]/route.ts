import { getCurrentUser } from "@/lib/auth"
import { addComment, loadCard } from "@/lib/hermes/team"
import { NextResponse } from "next/server"

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/team/board/:id: card with its comment thread. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const res = await loadCard((await params).id)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status === 404 ? 404 : 502 })
  const { task, comments } = res.data
  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      body: task.body ?? "",
      assignee: task.assignee,
      status: task.status,
      blockKind: task.block_kind,
    },
    comments: comments.map(({ id, author, body, created_at }) => ({ id, author, body, created: created_at })),
  })
}

/** POST /api/team/board/:id { body }: add a comment to the card. */
export async function POST(request: Request, { params }: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { body } = (await request.json().catch(() => ({}))) as { body?: unknown }
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 })
  }
  const res = await addComment((await params).id, body.trim())
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
