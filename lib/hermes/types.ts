import type { UIMessage } from "ai"

// v5 UIMessage has no room for our own per-message bookkeeping, so it rides
// along in `metadata`. `createdAt` is an ISO string (not a Date) since
// UIMessage/metadata must stay JSON-serialisable.
export type ZolaMessageMetadata = {
  createdAt?: string
  model?: string
}

export type ZolaUIMessage = UIMessage<ZolaMessageMetadata>

// Loosely typed so it works across any useChat instance's UIMessage
// (different metadata/tool generics), not just ZolaUIMessage.
type PartsBearing = { parts: readonly { type: string; text?: string }[] }

/** Plain-text rendering of a UIMessage's text parts (for edit boxes, copy). */
export function textFromMessage(message: PartsBearing): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

export function attachmentsFromMessage(
  message: PartsBearing
): { name: string; contentType: string; url: string }[] {
  return message.parts
    .filter(
      (p): p is { type: "file"; mediaType: string; filename?: string; url: string } =>
        p.type === "file"
    )
    .map((p) => ({
      name: p.filename || "attachment",
      contentType: p.mediaType,
      url: p.url,
    }))
}
