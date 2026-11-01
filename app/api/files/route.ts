import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { saveBlob, storedName } from "@/lib/blobs"
import { detectFile } from "@/lib/file-handling"

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB limit` },
      { status: 413 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const type = await detectFile(buffer, file.name)
  if (!type) {
    return NextResponse.json(
      { error: "File type not supported or doesn't match its extension" },
      { status: 415 }
    )
  }

  const id = await saveBlob(buffer, { name: file.name, contentType: type.mime, ext: type.ext })

  return NextResponse.json({
    url: `/api/files/${id}`,
    name: file.name,
    contentType: type.mime,
    // Stored file name under BLOB_DIR; the chat route prefixes BLOB_HOST_DIR.
    storedName: storedName(id, type.ext),
  })
}
