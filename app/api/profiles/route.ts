import { getCurrentUser } from "@/lib/auth"
import { activeProfile } from "@/lib/hermes/client"
import { listProfiles } from "@/lib/hermes/profiles"
import { NextResponse } from "next/server"

/** GET /api/profiles: the personas the user can switch to and the active one. Keys never leave the server. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json({ profiles: listProfiles(), active: await activeProfile(user.id) })
}
