import { getCurrentUser } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Most-recently-updated first: with no canvasId of its own to disambiguate,
  // the client treats index 0 as "the user's canvas".
  const rows = await db
    .select()
    .from(schema.canvases)
    .where(eq(schema.canvases.userId, user.id))
    .orderBy(desc(schema.canvases.updatedAt))

  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, content } = (await request.json()) as {
    title?: string
    content?: string
  }

  const [canvas] = await db
    .insert(schema.canvases)
    .values({
      userId: user.id,
      title: title || "Untitled",
      content: content ?? "",
    })
    .returning()

  return NextResponse.json(canvas)
}
