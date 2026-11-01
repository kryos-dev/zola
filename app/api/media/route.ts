import { getCurrentUser } from "@/lib/auth"
import { dashboardJson } from "@/lib/cloud9/dashboard"
import { NextResponse } from "next/server"

// Streams a file the answer delivered with a `MEDIA:` tag.
//
// The file lives on the Hermes host, not in this container, so the bytes come
// from the dashboard's file API -- which does its own path and size checking
// and refuses sensitive files. This route adds the app's own auth on top and
// hands the browser bytes instead of a base64 data url (a third smaller).
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const path = new URL(request.url).searchParams.get("path")
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 })

  const res = await dashboardJson<{ dataUrl?: string }>(
    `/api/fs/read-data-url?path=${encodeURIComponent(path)}`
  )
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status || 502 })
  }

  const dataUrl = res.data?.dataUrl
  const comma = dataUrl ? dataUrl.indexOf(",") : -1
  if (!dataUrl || comma < 0) {
    return NextResponse.json({ error: "No file data" }, { status: 502 })
  }

  // "data:image/png;base64,AAAA" -> "image/png" and the decoded bytes.
  const contentType =
    dataUrl.slice("data:".length, comma).split(";")[0] || "application/octet-stream"
  const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64")

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      // Not content-addressed -- the same path can be rewritten -- so short
      // rather than immutable.
      "Cache-Control": "private, max-age=60",
    },
  })
}
