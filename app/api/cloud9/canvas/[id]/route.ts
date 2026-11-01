import { getCurrentUser } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const updates: Partial<typeof schema.canvases.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (typeof body.title === "string") updates.title = body.title
  if (typeof body.content === "string") updates.content = body.content

  const [canvas] = await db
    .update(schema.canvases)
    .set(updates)
    .where(and(eq(schema.canvases.id, id), eq(schema.canvases.userId, user.id)))
    .returning({
      id: schema.canvases.id,
      title: schema.canvases.title,
      content: schema.canvases.content,
      updatedAt: schema.canvases.updatedAt,
    })

  if (!canvas) return NextResponse.json({ error: "Canvas not found" }, { status: 404 })
  return NextResponse.json(canvas)
}
