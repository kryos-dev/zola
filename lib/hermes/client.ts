import { readBlob } from "@/lib/blobs"
import { db, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import type { UIMessage } from "ai"

/** The virtual model id meaning "whatever the agent is configured with". */
export const AGENT_DEFAULT = "hermes-agent"

/** A picked model travels as one id: "<provider slug>|<model>". */
export const MODEL_ID_SEP = "|"

export function encodeModelId(provider: string, model: string): string {
  return `${provider}${MODEL_ID_SEP}${model}`
}

export function decodeModelId(
  id: string | undefined
): { provider: string; model: string } | null {
  if (!id || id === AGENT_DEFAULT) return null
  const i = id.indexOf(MODEL_ID_SEP)
  if (i <= 0 || i === id.length - 1) return null
  return { provider: id.slice(0, i), model: id.slice(i + 1) }
}

// The gateway skips image data larger than this and caps the whole request at
// 10 MB, so bigger images are left out rather than failing the turn.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

type InputPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }

const BLOB_URL_PREFIX = "/api/files/"

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

// The new user turn as session chat input. Images are inlined as data URLs
// (the endpoint accepts only text and image parts); any other file is named in
// the text by its path on the Hermes host so the agent opens it with its own
// tools.
async function userTurnInput(message: UIMessage): Promise<string | InputPart[]> {
  let text = textOf(message)
  const images: InputPart[] = []
  const hostDir = (process.env.BLOB_HOST_DIR ?? "").replace(/\/+$/, "")

  for (const part of message.parts) {
    if (part.type !== "file") continue
    const id = part.url.startsWith(BLOB_URL_PREFIX)
      ? part.url.slice(BLOB_URL_PREFIX.length)
      : null
    const blob = id ? await readBlob(id) : null
    if (part.mediaType?.startsWith("image/")) {
      if (blob && blob.bytes.length <= MAX_IMAGE_BYTES) {
        images.push({
          type: "input_image",
          image_url: `data:${blob.contentType};base64,${blob.bytes.toString("base64")}`,
        })
      } else if (part.url.startsWith("data:image/") || /^https?:/.test(part.url)) {
        images.push({ type: "input_image", image_url: part.url })
      }
    } else if (blob) {
      text += `${text ? "\n" : ""}Attached file: ${hostDir}/${blob.storedName} (${
        part.filename || blob.name
      }, ${part.mediaType || blob.contentType})`
    }
  }

  if (!images.length) return text
  return [...(text ? [{ type: "input_text" as const, text }] : []), ...images]
}

function hermesHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.HERMES_API_KEY}`,
    ...extra,
  }
}

/** Scopes the agent's long-term memory to the person across sessions. */
export function sessionKeyFor(username: string): string {
  if (!username) throw new Error("Cannot build a Hermes session key without a user")
  return `kryos:zola:dm:${username}`
}

async function newSessionId(username: string): Promise<string> {
  const res = await fetch(`${process.env.HERMES_API_URL}/api/sessions`, {
    method: "POST",
    headers: hermesHeaders({ "X-Hermes-Session-Key": sessionKeyFor(username) }),
    body: "{}",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Hermes session create failed (${res.status}): ${text}`)
  }
  const id = ((await res.json()) as { session?: { id?: string } }).session?.id
  if (!id) throw new Error("Hermes session create returned no id")
  return id
}

type SessionUser = { id: string; username: string }

/**
 * The user's current rolling Hermes session id, created on first use. Two
 * simultaneous first requests may each create a Hermes session; the insert
 * keeps one row and both read the winner (the loser's session is orphaned).
 */
export async function currentSession(user: SessionUser): Promise<string> {
  const read = async () => {
    const [row] = await db
      .select({ id: schema.userSessions.hermesSessionId })
      .from(schema.userSessions)
      .where(eq(schema.userSessions.userId, user.id))
    return row?.id
  }
  const existing = await read()
  if (existing) return existing
  await db
    .insert(schema.userSessions)
    .values({ userId: user.id, hermesSessionId: await newSessionId(user.username) })
    .onConflictDoNothing()
  return (await read())!
}

/** Points the user at a fresh Hermes session and returns its id. */
export async function replaceSession(user: SessionUser): Promise<string> {
  const id = await newSessionId(user.username)
  await db
    .insert(schema.userSessions)
    .values({ userId: user.id, hermesSessionId: id })
    .onConflictDoUpdate({
      target: schema.userSessions.userId,
      set: { hermesSessionId: id, updatedAt: new Date() },
    })
  return id
}

/** Best-effort removal of a chat's Hermes session; failures are ignored. */
export async function deleteHermesSession(sessionId: string): Promise<void> {
  await fetch(
    `${process.env.HERMES_API_URL}/api/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", headers: hermesHeaders() }
  ).catch(() => {})
}

type HermesRequestArgs = {
  /** The newest user message; earlier turns live in the Hermes session. */
  message: UIMessage
  /** Zola model id; "hermes-agent" or empty means the agent's own default. */
  model?: string
  user: SessionUser
  sessionId: string
  systemPrompt?: string
  /** none | low | medium | high | max, see lib/thinking-effort.ts */
  reasoningEffort: string
  signal?: AbortSignal
}

// POSTs the new turn to the session's `/chat/stream` and returns the raw
// Response for hermesSessionStreamToUIMessageStream plus the session id it
// actually ran on. The session keeps the conversation (attachments included)
// and compacts it server-side, so only the newest message travels; the session
// key (per user) scopes the agent's memory across sessions. A session that no
// longer exists on the Hermes side (404) is replaced by a new one, the user's
// pointer is updated, and the turn is retried once (`replaced` is then true:
// the earlier transcript is gone).
export async function hermesRequest({
  message,
  model,
  user,
  sessionId,
  systemPrompt,
  reasoningEffort,
  signal,
}: HermesRequestArgs): Promise<{
  res: Response
  sessionId: string
  replaced: boolean
}> {
  const picked = decodeModelId(model)
  const body = JSON.stringify({
    message: await userTurnInput(message),
    instructions: systemPrompt,
    model_options: { reasoning_effort: reasoningEffort },
    // An explicit provider is always honored by the gateway; a bare model
    // would be dropped.
    ...(picked ? { model: picked.model, provider: picked.provider } : {}),
  })
  const post = (id: string) =>
    fetch(
      `${process.env.HERMES_API_URL}/api/sessions/${encodeURIComponent(id)}/chat/stream`,
      {
        method: "POST",
        signal,
        headers: hermesHeaders({
          "X-Hermes-Session-Key": sessionKeyFor(user.username),
        }),
        body,
      }
    )

  let res = await post(sessionId)
  let replaced = false
  if (res.status === 404) {
    sessionId = await replaceSession(user)
    replaced = true
    res = await post(sessionId)
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "")
    throw new Error(`Hermes agent request failed (${res.status}): ${text}`)
  }
  return { res, sessionId, replaced }
}
