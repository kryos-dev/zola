import { getCurrentUser } from "@/lib/auth"
import { activeSession } from "@/lib/hermes/client"
import { getRun } from "@/lib/runs"
import { createUIMessageStreamResponse } from "ai"
import { NextResponse } from "next/server"

/**
 * Where `useChat` reattaches (GET /api/chat/stream) after a dropped connection
 * or a reload mid-reply. While a turn is running for the user's session, the
 * response replays its recorded chunks and then follows it live. With no turn
 * running there is nothing to attach to and the answer is the SDK's "no active
 * stream" 204; the client then reads the reply from /api/history.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const run = getRun((await activeSession(user)).sessionId)
  if (!run) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    })
  }
  return createUIMessageStreamResponse({ stream: run.subscribe() })
}
