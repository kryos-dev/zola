import type { ZolaUIMessage } from "@/lib/hermes/types"
import { fetchClient } from "@/lib/fetch"

export type History = {
  /** The persona whose session this is. */
  profile?: string
  /** Oldest first. */
  messages: ZolaUIMessage[]
  /** A turn is still running on the server; `messages` ends with its question. */
  pending: boolean
  /** Pass as `before` for the next older page; null at the start of the transcript. */
  nextCursor: number | null
  /** The next page continues into compacted rows: request it with `compacted=true`. */
  nextCompacted?: boolean
}

/** One page of the user's rolling Hermes session (see app/api/history/route.ts). */
export async function fetchHistory(before = 0, compacted = false): Promise<History> {
  const res = await fetchClient(
    `/api/history?before=${before}&compacted=${compacted ? 1 : 0}`
  )
  if (!res.ok) throw new Error("Failed to load history")
  return res.json()
}
