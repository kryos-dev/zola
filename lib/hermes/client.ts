import { readBlob } from "@/lib/blobs"
import { db, schema } from "@/lib/db"
import { and, eq } from "drizzle-orm"
import { DEFAULT_PROFILE, isProfile, profileBase } from "./profiles"
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

function hermesHeaders(profile: string, extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${profileBase(profile).key}`,
    ...extra,
  }
}

/** Scopes the agent's long-term memory to the person and persona across sessions. */
export function sessionKeyFor(username: string, profile: string): string {
  if (!username) throw new Error("Cannot build a Hermes session key without a user")
  return `kryos:zola:${profile}:dm:${username}`
}

async function newSessionId(username: string, profile: string): Promise<string> {
  const res = await fetch(`${profileBase(profile).baseUrl}/api/sessions`, {
    method: "POST",
    headers: hermesHeaders(profile, {
      "X-Hermes-Session-Key": sessionKeyFor(username, profile),
    }),
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

/** The persona the user is talking to; the default when none is set or it was removed from the env. */
export async function activeProfile(userId: string): Promise<string> {
  const [row] = await db
    .select({ profile: schema.userSessions.profile })
    .from(schema.userSessions)
    .where(and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.isActive, true)))
  return row && isProfile(row.profile) ? row.profile : DEFAULT_PROFILE
}

/** The active persona and its rolling session id. */
export async function activeSession(user: SessionUser) {
  const profile = await activeProfile(user.id)
  return { profile, sessionId: await currentSession(user, profile) }
}

/** Makes `profile` the user's active persona (its session must exist). */
export async function setActiveProfile(userId: string, profile: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.userSessions)
      .set({ isActive: false })
      .where(eq(schema.userSessions.userId, userId))
    await tx
      .update(schema.userSessions)
      .set({ isActive: true })
      .where(and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.profile, profile)))
  })
}

/**
 * The user's current rolling Hermes session id for a persona, created on first
 * use. Two simultaneous first requests may each create a Hermes session; the
 * insert keeps one row and both read the winner (the loser's session is
 * orphaned).
 */
export async function currentSession(user: SessionUser, profile: string): Promise<string> {
  const read = async () => {
    const [row] = await db
      .select({ id: schema.userSessions.hermesSessionId })
      .from(schema.userSessions)
      .where(
        and(eq(schema.userSessions.userId, user.id), eq(schema.userSessions.profile, profile))
      )
    return row?.id
  }
  const existing = await read()
  if (existing) return existing
  const [anyRow] = await db
    .select({ p: schema.userSessions.profile })
    .from(schema.userSessions)
    .where(eq(schema.userSessions.userId, user.id))
    .limit(1)
  await db
    .insert(schema.userSessions)
    .values({
      userId: user.id,
      profile,
      // A user's very first session is the active one.
      isActive: !anyRow,
      hermesSessionId: await newSessionId(user.username, profile),
    })
    .onConflictDoNothing()
  return (await read())!
}

/** Points the user at a fresh Hermes session for a persona and returns its id. */
export async function replaceSession(user: SessionUser, profile: string): Promise<string> {
  const id = await newSessionId(user.username, profile)
  await db
    .insert(schema.userSessions)
    .values({ userId: user.id, profile, hermesSessionId: id })
    .onConflictDoUpdate({
      target: [schema.userSessions.userId, schema.userSessions.profile],
      set: { hermesSessionId: id, updatedAt: new Date() },
    })
  return id
}

/** Best-effort removal of a chat's Hermes session; failures are ignored. */
export async function deleteHermesSession(sessionId: string, profile: string): Promise<void> {
  await fetch(
    `${profileBase(profile).baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", headers: hermesHeaders(profile) }
  ).catch(() => {})
}

type HermesRequestArgs = {
  /** The newest user message; earlier turns live in the Hermes session. */
  message: UIMessage
  /** Zola model id; "hermes-agent" or empty means the agent's own default. */
  model?: string
  user: SessionUser
  profile: string
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
  profile,
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
      `${profileBase(profile).baseUrl}/api/sessions/${encodeURIComponent(id)}/chat/stream`,
      {
        method: "POST",
        signal,
        headers: hermesHeaders(profile, {
          "X-Hermes-Session-Key": sessionKeyFor(user.username, profile),
        }),
        body,
      }
    )

  let res = await post(sessionId)
  let replaced = false
  if (res.status === 404) {
    sessionId = await replaceSession(user, profile)
    replaced = true
    res = await post(sessionId)
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "")
    throw new Error(`Hermes agent request failed (${res.status}): ${text}`)
  }
  return { res, sessionId, replaced }
}
