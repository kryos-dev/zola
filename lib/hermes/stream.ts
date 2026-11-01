import { createUIMessageStream, type UIMessage, type UIMessageStreamWriter } from "ai"
import { toolTimer, turnData } from "@/lib/turn"
import { parseJsonOr } from "./parts"

// Maps the Hermes session chat SSE (`POST /api/sessions/{id}/chat/stream`) to
// the AI SDK v5+ UI message stream protocol. Emits writer.write() chunks;
// createUIMessageStream reconstructs the final assistant UIMessage (with
// `.parts`) for onFinish persistence.
//
// Each frame is `event: <name>\ndata: <json>\n\n`; `: keepalive` comment
// frames carry no data line and are skipped. Events:
//   assistant.delta       {delta}                       -> text-delta
//   reasoning.delta       {message_id,delta}            -> reasoning-delta
//   tool.started          {tool_name,preview,args}      -> tool-input-start + tool-input-available
//   tool.completed        {tool_name,preview}           -> tool-output-available
//   tool.failed           {tool_name,preview}           -> tool-output-error
//   assistant.commentary  {text,already_streamed}       -> own text part when not yet streamed
//   assistant.completed   {content}                     -> authoritative final text
//   run.completed|run.cancelled {usage}                 -> data-turn + finish
//   run.failed|error      {message}                     -> error
//   done                                                -> finish if nothing finished the stream yet
// run.started, message.started and approval.request have no stream equivalent.
//
// Tool events carry no call id, so one is minted per tool.started and the
// matching tool.completed / tool.failed (same tool_name, oldest first) closes it.
//
// assistant.completed resolves media tags to data URLs, so its `content` can
// differ from the streamed deltas. The stream protocol cannot rewrite text
// already sent: when the streamed text is a prefix of `content` the rest is
// appended, otherwise `content` follows as a separate final text part.

type HermesStreamOpts = {
  /** Id the assistant message is created under; the SDK invents one when omitted. */
  messageId?: string
  onFinish?: (payload: { message: UIMessage }) => void | Promise<void>
}

const TEXT_ID = "hermes-text"

async function writeHermesSession(
  sse: ReadableStream<Uint8Array>,
  writer: UIMessageStreamWriter,
  messageId?: string
): Promise<void> {
  const decoder = new TextDecoder()
  let textOpen = false
  // All streamed assistant text across text parts, not just the currently open
  // part: a response can emit prose, call a tool, then continue with prose.
  // Hermes' assistant.completed contains the full final answer, so comparing
  // only the final segment appended the whole answer a second time.
  let streamedText = ""
  let finished = false
  let extraParts = 0
  const startedAt = Date.now()
  // Per-tool wall clock: from tool.started to its tool.completed / tool.failed.
  const timer = toolTimer()
  // Minted call ids of tools still running, per tool_name, oldest first.
  const running = new Map<string, string[]>()
  let toolCount = 0

  writer.write({ type: "start", ...(messageId ? { messageId } : {}) })

  // Each thinking block gets its own part and closes as soon as text or a tool
  // call follows.
  let reasoningId: string | null = null
  let reasoningCount = 0
  const closeReasoningIfOpen = () => {
    if (reasoningId) {
      writer.write({ type: "reasoning-end", id: reasoningId })
      reasoningId = null
    }
  }
  const closeTextIfOpen = () => {
    closeReasoningIfOpen()
    if (textOpen) {
      writer.write({ type: "text-end", id: TEXT_ID })
      textOpen = false
    }
  }
  const writeReasoningDelta = (delta: string) => {
    if (!delta) return
    if (!reasoningId && !delta.trim()) return
    if (textOpen) closeTextIfOpen()
    if (!reasoningId) {
      reasoningId = `hermes-reasoning-${reasoningCount++}`
      writer.write({ type: "reasoning-start", id: reasoningId })
    }
    writer.write({ type: "reasoning-delta", id: reasoningId, delta })
  }
  const writeTextDelta = (delta: string) => {
    if (!delta) return
    streamedText += delta
    // Leading whitespace is dropped from the stream (but kept in streamedText
    // for comparing with assistant.completed): opening a text part for it would
    // hide the loader while nothing visible is drawn.
    if (!textOpen && !delta.trim()) return
    closeReasoningIfOpen()
    if (!textOpen) {
      writer.write({ type: "text-start", id: TEXT_ID })
      textOpen = true
    }
    writer.write({ type: "text-delta", id: TEXT_ID, delta })
  }
  const writeTextPart = (text: string) => {
    streamedText += text
    const id = `hermes-text-extra-${extraParts++}`
    writer.write({ type: "text-start", id })
    writer.write({ type: "text-delta", id, delta: text })
    writer.write({ type: "text-end", id })
  }
  const finish = (usage?: Record<string, number>) => {
    if (finished) return
    finished = true
    closeTextIfOpen()
    writer.write({
      type: "data-turn",
      id: "turn",
      data: turnData(
        startedAt,
        {
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
          totalTokens: usage?.total_tokens,
        },
        timer.tools
      ),
    })
    writer.write({ type: "finish" })
  }
  const fail = (message: string) => {
    if (finished) return
    finished = true
    closeTextIfOpen()
    writer.write({ type: "error", errorText: message || "Hermes agent request failed" })
  }
  const endTool = (toolName: string): string | undefined => {
    const id = running.get(toolName)?.shift()
    if (id) timer.end(id)
    return id
  }

  const handleFrame = (frame: string) => {
    const lines = frame.split("\n")
    const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim()
    const dataLine = lines.find((l) => l.startsWith("data:"))
    if (!event || !dataLine) return
    const raw = dataLine.slice(5).trim()
    if (!raw) return

    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }
    const str = (v: unknown) => (typeof v === "string" ? v : "")

    switch (event) {
      case "assistant.delta": {
        writeTextDelta(str(data.delta))
        break
      }
      // `tool.progress` `_thinking` carries the model's text preview, not
      // reasoning, and that text is already streamed as assistant.delta, so it
      // is ignored. `reasoning.delta` is the real reasoning stream.
      case "reasoning.delta": {
        writeReasoningDelta(str(data.delta))
        break
      }
      case "tool.started": {
        closeTextIfOpen()
        const toolName = str(data.tool_name)
        const toolCallId = `hermes-tool-${toolCount++}`
        running.set(toolName, [...(running.get(toolName) ?? []), toolCallId])
        timer.start(toolCallId)
        writer.write({ type: "tool-input-start", toolCallId, toolName })
        writer.write({
          type: "tool-input-available",
          toolCallId,
          toolName,
          input: data.args ?? {},
        })
        break
      }
      case "tool.completed": {
        closeTextIfOpen()
        const toolCallId = endTool(str(data.tool_name))
        if (!toolCallId) break
        writer.write({
          type: "tool-output-available",
          toolCallId,
          output: parseJsonOr<unknown>(str(data.preview), (r) => r),
        })
        break
      }
      case "tool.failed": {
        closeTextIfOpen()
        const toolCallId = endTool(str(data.tool_name))
        if (!toolCallId) break
        writer.write({
          type: "tool-output-error",
          toolCallId,
          errorText: str(data.preview) || "Tool failed",
        })
        break
      }
      case "assistant.commentary": {
        if (data.already_streamed === false && str(data.text).trim()) {
          closeTextIfOpen()
          writeTextPart(str(data.text))
        }
        break
      }
      case "assistant.completed": {
        const content = str(data.content)
        if (!content) break
        // The authoritative final is the LAST segment of the reply, while the
        // stream carries every segment. So it is already on screen when the
        // streamed text ENDS with it -- comparing against the whole of it
        // treated a multi-round reply's final segment as new text and appended
        // the answer a second time. Only when the final actually continues the
        // stream (a rewritten tail, resolved media, nothing streamed at all) is
        // there anything left to write.
        const streamed = streamedText.trimEnd()
        const finalText = content.trimStart()
        if (streamedText.trim() && streamedText.trim().endsWith(finalText.trim())) break
        if (finalText.startsWith(streamed)) {
          const rest = finalText.slice(streamed.length)
          // The stream already ended in whitespace (a separator), so keeping
          // the final's own leading whitespace would double the gap.
          writeTextDelta(/\s$/.test(streamedText) ? rest.replace(/^\s+/, "") : rest)
        } else {
          closeTextIfOpen()
          writeTextPart(content)
        }
        break
      }
      case "run.completed":
      case "run.cancelled": {
        finish(data.usage as Record<string, number> | undefined)
        break
      }
      case "run.failed":
      case "error": {
        const error = data.error ?? data.message
        fail(
          typeof error === "string"
            ? error
            : ((error as { message?: string } | undefined)?.message ?? "")
        )
        break
      }
      case "done": {
        finish()
        break
      }
      default:
        break
    }
  }

  const reader = sse.getReader()
  let buf = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        handleFrame(buf.slice(0, idx))
        buf = buf.slice(idx + 2)
      }
    }
    if (buf.trim()) handleFrame(buf)
    closeTextIfOpen()
  } catch (err) {
    closeTextIfOpen()
    writer.write({
      type: "error",
      errorText: err instanceof Error ? err.message : String(err),
    })
  }
}

export function hermesSessionStreamToUIMessageStream(
  sse: ReadableStream<Uint8Array>,
  opts: HermesStreamOpts = {}
) {
  // Two nested UI message streams, not one: the inner one is read to
  // completion right here (never by the HTTP response consumer), so its
  // onFinish always fires from a normal `flush` once the SSE fully drains -
  // never from `cancel`, whose accumulated text would be truncated at
  // whatever point the browser disconnected. The outer stream just relays
  // chunks to the real client and keeps forwarding (into a writer that
  // silently no-ops once cancelled) even after that client goes away, so
  // the inner read loop is never starved.
  const inner = createUIMessageStream({
    execute: async ({ writer }) => {
      await writeHermesSession(sse, writer, opts.messageId)
    },
    onFinish: async ({ responseMessage }) => {
      try {
        await opts.onFinish?.({ message: responseMessage })
      } catch (err) {
        console.error("hermes onFinish persistence failed:", err)
      }
    },
  })

  return createUIMessageStream({
    execute: async ({ writer }) => {
      const reader = inner.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          writer.write(value)
        }
      } catch (err) {
        writer.write({
          type: "error",
          errorText: err instanceof Error ? err.message : String(err),
        })
      }
    },
  })
}
