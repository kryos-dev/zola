export type ChatSendStatus = "submitted" | "streaming" | "ready" | "error"
export type ChatSendIntent = "queue" | "stop" | "send" | "ignore"

export function chatSendIntent(
  status: ChatSendStatus,
  text: string,
  fileCount: number
): ChatSendIntent {
  const hasPayload = /\S/.test(text) || fileCount > 0
  const busy = status === "streaming" || status === "submitted"
  if (busy) return hasPayload ? "queue" : "stop"
  return hasPayload ? "send" : "ignore"
}
