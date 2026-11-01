import { loadHistory } from "@/app/api/history/load"
import { getCurrentUser } from "@/lib/auth"
import { currentSession, setActiveProfile } from "@/lib/hermes/client"
import { isProfile } from "@/lib/hermes/profiles"
import { NextResponse } from "next/server"

/** POST /api/profiles/active { name }: switch persona; answers with the first history page of its session. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name } = (await request.json().catch(() => ({}))) as { name?: unknown }
  if (typeof name !== "string" || !isProfile(name)) {
    return NextResponse.json({ error: "Unknown profile" }, { status: 404 })
  }

  await currentSession(user, name) // make sure the persona's session row exists
  await setActiveProfile(user.id, name)
  const history = await loadHistory(user, 0, false)
  if (!history) return NextResponse.json({ error: "History unavailable" }, { status: 502 })
  return NextResponse.json({ active: name, history })
}
