import { getCurrentUser } from "@/lib/auth"
import { activeSession } from "@/lib/hermes/client"
import { abortRun } from "@/lib/runs"
import { NextResponse } from "next/server"

/**
 * POST /api/chat/abort: stop the turn running for the user's session.
 *
 * The Stop button aborts the browser's fetch, which this server ignores on
 * purpose so a reply survives the tab closing. This is how the client says
 * "no, actually stop" and gets the upstream model request cancelled.
 *
 * Always 200 with `{ aborted }`: nothing in flight is a normal answer (the
 * turn may have finished between the click and this request).
 */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json({ aborted: abortRun((await activeSession(user)).sessionId) })
}
