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

// Voice mode recorder fallback: the browser's recording in, {text} out. The dashboard route takes
// a JSON body with the audio as a base64 data url, so the upload is re-encoded
// here.
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 })
  }

  const mime = (file.type || "audio/webm").split(";")[0]
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64")

  try {
    const res = await dashboardFetch(`/api/audio/transcribe?profile=${encodeURIComponent(await profileFor(request, user.id))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data_url: `data:${mime};base64,${b64}`, mime_type: mime }),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Transcription failed: ${await upstreamError(res)}` }, { status: 502 })
    }
    const { transcript } = (await res.json()) as { transcript?: string }
    return NextResponse.json({ text: transcript ?? "" })
  } catch (err) {
    return NextResponse.json({ error: `Transcription service unreachable (${(err as Error).message})` }, { status: 502 })
  }
}
