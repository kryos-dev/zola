import { getCurrentUser } from "@/lib/auth"
import { activeProfile } from "@/lib/hermes/client"
import { isProfile } from "@/lib/hermes/profiles"
import { NextResponse } from "next/server"
import { dashboardFetch, upstreamError } from "@/lib/cloud9/dashboard"

// ?profile=<name> picks the persona whose voice/model Hermes uses; the active one by default.
async function profileFor(request: Request, userId: string) {
  const p = new URL(request.url).searchParams.get("profile")
  return p && isProfile(p) ? p : activeProfile(userId)
}

// Read aloud: {text} in, audio bytes out. The dashboard returns the audio as a
// base64 data url, which is decoded here.
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { text } = ((await request.json().catch(() => ({}))) ?? {}) as { text?: unknown }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 })
  }

  try {
    const res = await dashboardFetch(`/api/audio/speak?profile=${encodeURIComponent(await profileFor(request, user.id))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Speech failed: ${await upstreamError(res)}` }, { status: 502 })
    }
    const { data_url, mime_type } = (await res.json()) as { data_url?: string; mime_type?: string }
    const b64 = data_url?.split(",", 2)[1]
    if (!b64) return NextResponse.json({ error: "Speech failed: empty audio" }, { status: 502 })
    return new Response(Buffer.from(b64, "base64"), {
      headers: { "Content-Type": mime_type || "audio/mpeg" },
    })
  } catch (err) {
    return NextResponse.json({ error: `Speech service unreachable (${(err as Error).message})` }, { status: 502 })
  }
}
