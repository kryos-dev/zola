export const EMPTY_REPLY_TEXT =
  "This turn finished without a text reply. You can continue with a follow-up."

type AssistantPart = {
  type: string
  text?: string
  [key: string]: unknown
}

/**
 * Normalize the persisted form of a finished assistant turn. Hermes can finish
 * with tool-call or whitespace-only parts but no user-facing text; persisting
 * those as `content: ""` made the assistant look as if it had answered with
 * nothing. Keep the parts for inspection, but add a truthful visible fallback.
 * A completed turn with no parts (or bookkeeping only) also gets that notice.
 */
export function persistedAssistantReply<T extends AssistantPart>(
  parts: T[]
): { parts: (T | { type: "text"; text: string })[]; content: string } {
  const content = parts
    .filter((part): part is T & { text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")

  if (content.trim()) return { parts, content }

  return {
    parts: [...parts, { type: "text", text: EMPTY_REPLY_TEXT }],
    content: EMPTY_REPLY_TEXT,
  }
}
