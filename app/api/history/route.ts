import { getCurrentUser } from "@/lib/auth"
import { currentSession } from "@/lib/hermes/client"
import { type HermesRow, rowsToMessages } from "@/lib/hermes/history"
import { hasRun } from "@/lib/runs"
import { NextResponse } from "next/server"

const PAGE = 100

/**
 * GET /api/history?before=<cursor>&compacted=0|1
 *
 * The user's rolling Hermes session as UI messages, newest page first. The
 * cursor is the number of rows already loaded from the end of the transcript
 * (Hermes pages with `order=latest&offset`); `nextCursor` is null at the start.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const before = Math.max(0, Number(url.searchParams.get("before")) || 0)
  const sessionId = await currentSession(user)

  const res = await fetch(
    `${process.env.HERMES_API_URL}/api/sessions/${encodeURIComponent(sessionId)}/messages` +
      `?inline_images=false&order=latest&limit=${PAGE}&offset=${before}` +
      `&include_compacted=${url.searchParams.get("compacted") === "1"}`,
    {
      headers: { Authorization: `Bearer ${process.env.HERMES_API_KEY}` },
      cache: "no-store",
    }
  )
  if (res.status === 404) {
    return NextResponse.json({ messages: [], pending: false, nextCursor: null })
  }
  if (!res.ok) {
    return NextResponse.json({ error: "History unavailable" }, { status: 502 })
  }

  let rows = ((await res.json()) as { data: HermesRow[] }).data
  const more = rows.length === PAGE
  // A page starts at a user row so a turn is never split across pages: the
  // leading rows of a cut turn are left for the next (older) page to include.
  const firstUser = rows.findIndex((r) => r.role === "user")
  const dropped = more && firstUser > 0 ? firstUser : 0
  rows = rows.slice(dropped)

  // A turn is still running: the list ends on the question it answers; the
  // reattached stream supplies the rest.
  const pending = hasRun(sessionId)
  if (pending && before === 0) {
    const lastUser = rows.map((r) => r.role).lastIndexOf("user")
    rows = rows.slice(0, lastUser + 1)
  }

  return NextResponse.json({
    messages: rowsToMessages(rows),
    pending,
    nextCursor: more ? before + PAGE - dropped : null,
  })
}
