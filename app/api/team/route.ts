import { getCurrentUser } from "@/lib/auth"
import { listProfiles } from "@/lib/hermes/profiles"
import { loadRoster } from "@/lib/hermes/team"
import { NextResponse } from "next/server"

/** GET /api/team: configured agents with role, online flag, derived state and card counts. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const res = await loadRoster(listProfiles())
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })
  return NextResponse.json({ agents: res.agents })
}
