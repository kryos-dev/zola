import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { db, schema } from "@/lib/db"
import { getCurrentUser } from "./index"

export { isUnder } from "./paths"

// Every route handler is on its own here: the middleware matcher excludes
// /api, so nothing above these functions checks who is asking. Until this app
// had a second account that only cost a missing filter; with more than one
// person signed in it is the whole boundary, so the checks live in one place
// rather than being re-typed per handler.

export type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>

export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 })
export const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 })
export const notFound = (what = "Not found") =>
  NextResponse.json({ error: what }, { status: 404 })

/** The signed-in person, or a 401 response to return as-is. */
export async function requireUser(): Promise<
  { user: User; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getCurrentUser()
  return user ? { user } : { response: unauthorized() }
}

/**
 * Admin is the access service's answer, not a second idea of one: it sets
 * is_admin on the account and Caddy copies it onto every request as
 * Remote-Groups. `isAdminRequest` already read that header for the one route
 * that needed it; this re-exports it so the rest of the operator surface asks
 * the same question.
 */
export async function isAdminRequest(): Promise<boolean> {
  const groups = (await headers()).get("remote-groups") ?? ""
  return groups.split(",").map((g) => g.trim()).includes("admin")
}

export const isAdmin = isAdminRequest

/** The signed-in admin, or the response (401/403) to return as-is. */
export async function requireAdmin(): Promise<
  { user: User; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getCurrentUser()
  if (!user) return { response: unauthorized() }
  return (await isAdminRequest()) ? { user } : { response: forbidden() }
}

/** True when this project exists and belongs to this person. */
export async function ownsProject(
  projectId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId))
    )
    .limit(1)
  return Boolean(row)
}
