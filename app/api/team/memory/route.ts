import { getCurrentUser } from "@/lib/auth"
import { isProfile } from "@/lib/hermes/profiles"
import { loadMemory } from "@/lib/hermes/team"
import { NextResponse } from "next/server"

/** GET /api/team/memory?profile=: the profile's memory entries, read-only. */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = new URL(request.url).searchParams.get("profile") ?? ""
  if (!isProfile(profile)) return NextResponse.json({ error: "Unknown profile" }, { status: 404 })
  const res = await loadMemory(profile)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })
  return NextResponse.json({ nodes: res.nodes })
}
