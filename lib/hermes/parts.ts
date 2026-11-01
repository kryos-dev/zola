import type { UIMessage } from "ai"

// Part shapes shared by the live stream (lib/hermes/stream.ts, which the AI SDK
// folds into parts) and the history replay (lib/hermes/history.ts), so a turn
// renders the same through message-assistant.tsx either way.

type Part = UIMessage["parts"][number]

export function parseJsonOr<T>(text: string, fallback: (raw: string) => T): T {
  try {
    return JSON.parse(text)
  } catch {
    return fallback(text)
  }
}

export const textPart = (text: string): Part => ({ type: "text", text, state: "done" })

export const reasoningPart = (text: string): Part => ({
  type: "reasoning",
  text,
  state: "done",
})

/** A finished tool call: `tool-<name>`, as the SDK builds from the stream's tool chunks. */
export function toolPart(args: {
  toolName: string
  toolCallId: string
  input: unknown
  output?: unknown
  errorText?: string
}): Part {
  const { toolName, toolCallId, input, output, errorText } = args
  return (
    errorText === undefined
      ? { type: `tool-${toolName}`, toolCallId, state: "output-available", input, output }
      : { type: `tool-${toolName}`, toolCallId, state: "output-error", input, errorText }
  ) as Part
}
