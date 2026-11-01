import { getCurrentUser } from "@/lib/auth"
import { NextResponse } from "next/server"
import { loadHistory } from "./load"

/** GET /api/history?before=<cursor>&compacted=0|1: a page of the active persona's session (see load.ts). */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const page = await loadHistory(
    user,
    Math.max(0, Number(url.searchParams.get("before")) || 0),
    url.searchParams.get("compacted") === "1"
  )
  if (!page) return NextResponse.json({ error: "History unavailable" }, { status: 502 })
  return NextResponse.json(page)
}
