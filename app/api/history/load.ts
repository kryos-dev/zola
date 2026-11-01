import { activeSession } from "@/lib/hermes/client"
import { type HermesRow, rowsToMessages } from "@/lib/hermes/history"
import { profileBase } from "@/lib/hermes/profiles"
import { hasRun } from "@/lib/runs"

const PAGE = 100

/**
 * One page of the active persona's rolling Hermes session as UI messages,
 * newest page first. The cursor is the number of rows already loaded from the
 * end of the transcript (Hermes pages with `order=latest&offset`);
 * `nextCursor` is null at the start. `nextCompacted` says the next page must be
 * asked with `compacted=1`. Returns null when Hermes cannot be read.
 */
export async function loadHistory(
  user: { id: string; username: string },
  before: number,
  compacted: boolean
) {
  const { profile, sessionId } = await activeSession(user)
  const { baseUrl, key } = profileBase(profile)

  const res = await fetch(
    `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages` +
      `?inline_images=false&order=latest&limit=${PAGE}&offset=${before}` +
      `&include_compacted=${compacted}`,
    { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" }
  )
  if (res.status === 404) {
    return { profile, messages: [], pending: false, nextCursor: null, nextCompacted: false }
  }
  if (!res.ok) return null

  let rows = ((await res.json()) as { data: HermesRow[] }).data
  const fetched = rows.length
  const more = rows.length === PAGE
  // A page starts at a user row so a turn is never split across pages: the
  // leading rows of a cut turn are left for the next (older) page to include.
  const firstUser = rows.findIndex((r) => r.role === "user")
  const dropped = more && firstUser > 0 ? firstUser : 0
  rows = rows.slice(dropped)

  // A turn is still running: the list ends on the question it answers; the
  // reattached stream supplies the rest.
  const pending = hasRun(sessionId)
  if (pending && before === 0) {
    const lastUser = rows.map((r) => r.role).lastIndexOf("user")
    rows = rows.slice(0, lastUser + 1)
  }

  // The live transcript is exhausted: carry on into compacted rows from the
  // same offset (the client marks where they begin). Compacted rows are the
  // end of the line.
  const intoCompacted = !compacted && !more
  return {
    profile,
    messages: rowsToMessages(rows),
    pending,
    nextCursor: more ? before + PAGE - dropped : intoCompacted ? before + fetched : null,
    nextCompacted: intoCompacted,
  }
}
