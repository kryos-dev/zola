import { getCurrentUser } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, systemPrompt, description } = await request
    .json()
    .catch(() => ({}))
  if (!name?.trim()) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 })
  }

  try {
    const [project] = await db
      .insert(schema.projects)
      .values({
        name: name.trim(),
        systemPrompt: systemPrompt?.trim() || null,
        description: description?.trim() || null,
        userId: user.id,
      })
      .returning()
    return NextResponse.json(project)
  } catch (err) {
    console.error("create project failed", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create project" },
      { status: 500 }
    )
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // projects has no updated_at of its own, so the list reports createdAt.
  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      description: schema.projects.description,
      systemPrompt: schema.projects.systemPrompt,
      userId: schema.projects.userId,
      createdAt: schema.projects.createdAt,
      updatedAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .where(eq(schema.projects.userId, user.id))
    .orderBy(asc(schema.projects.createdAt))

  return NextResponse.json(rows)
}
