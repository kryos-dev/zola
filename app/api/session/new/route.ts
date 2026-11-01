import { getCurrentUser } from "@/lib/auth"
import { replaceSession } from "@/lib/hermes/client"
import { NextResponse } from "next/server"

/** POST /api/session/new: start a fresh Hermes session; memory (the session key) is kept. */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json({ sessionId: await replaceSession(user) })
}
