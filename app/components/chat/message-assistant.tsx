import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { useWorkspace } from "@/app/components/workspace/workspace-provider"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { textFromMessage } from "@/lib/hermes/types"
import { parseCanvasSegments } from "@/lib/canvas/parse"
import { chunkForSpeech } from "@/lib/speech-chunks"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { cn } from "@/lib/utils"
import type { UIMessage } from "ai"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  Check,
  Copy,
  FileText,
  SpeakerHighIcon,
  StopIcon,
} from "@phosphor-icons/react"
import { ChevronDownIcon } from "lucide-react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { CanvasBlock } from "./canvas-block"
import { MessageFeedback } from "./message-feedback"
import { QuoteButton } from "./quote-button"
import { ToolInvocation } from "./tool-invocation"
import { turnFromParts } from "@/lib/turn"
import { useAssistantMessageSelection } from "./useAssistantMessageSelection"
import { isVisiblePart, useCopy } from "./utils"

type Part = UIMessage["parts"][number]
type ReasoningPart = Extract<Part, { type: "reasoning" }>

type Block =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; part: ReasoningPart }
  | { kind: "tools"; parts: Part[] }

const isTool = (p: Part) => p.type.startsWith("tool-") || p.type === "dynamic-tool"

// Parts in stream order; consecutive tool calls fold into one group, anything
// else (text, reasoning) ends the group.
function toBlocks(parts: Part[]): Block[] {
  const out: Block[] = []
  for (const p of parts) {
    if (p.type === "text") {
      if (p.text.trim()) out.push({ kind: "text", text: p.text })
    } else if (p.type === "reasoning") {
      out.push({ kind: "reasoning", part: p })
    } else if (isTool(p)) {
      const last = out[out.length - 1]
      if (last?.kind === "tools") last.parts.push(p)
      else out.push({ kind: "tools", parts: [p] })
    }
  }
  return out
}

const triggerClass =
  "text-muted-foreground hover:text-foreground flex items-center gap-1 py-1 text-left text-sm transition-colors"

// The label depends only on whether the whole message is still streaming, so
// it flips once, when the message ends, and never when new text arrives.
function ToolGroup({
  parts,
  streaming,
  timings,
}: {
  parts: Part[]
  streaming: boolean
  timings?: Record<string, number>
}) {
  const [open, setOpen] = useState(false)
  const label = streaming
    ? "Working…"
    : `Used ${parts.length} ${parts.length === 1 ? "tool" : "tools"}`
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full min-w-0">
      <CollapsibleTrigger className={triggerClass}>
        {streaming ? <Shimmer as="span">{label}</Shimmer> : <span>{label}</span>}
        <ChevronDownIcon
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-border mt-1 w-full min-w-0 border-l">
        <ToolInvocation toolInvocations={parts} timings={timings} />
      </CollapsibleContent>
    </Collapsible>
  )
}

// Open while the thinking streams, closed once it ends. An explicit toggle by
// the user wins; the part never goes back to streaming, so it never reopens.
function ReasoningBlock({ part }: { part: ReasoningPart }) {
  const streaming = part.state === "streaming"
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? streaming
  if (!streaming && !part.text.trim()) return null
  return (
    <Collapsible open={open} onOpenChange={setUserOpen} className="w-full min-w-0">
      <CollapsibleTrigger className={triggerClass}>
        {streaming ? <Shimmer as="span">Thinking</Shimmer> : <span>Thinking</span>}
        <ChevronDownIcon
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-border mt-1 w-full min-w-0 border-l">
        <div className="prose prose-sm dark:prose-invert text-muted-foreground w-full min-w-0 max-w-full px-3 py-1">
          <MessageResponse>{part.text}</MessageResponse>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

type MessageAssistantProps = {
  id: string
  parts: Part[]
  /** This is the last message and a reply is still arriving. */
  streaming: boolean
  hasScrollAnchor?: boolean
  className?: string
  onQuote?: (text: string, messageId: string) => void
}

// Memoised on id, parts and the two flags that drive output, so streaming one
// message does not re-render the others.
export const MessageAssistant = memo(function MessageAssistant({
  id: messageId,
  parts,
  streaming,
  hasScrollAnchor,
  className,
  onQuote,
}: MessageAssistantProps) {
  const { preferences } = useUserPreferences()
  const answerText = textFromMessage({ parts })
  const { copied, copy: copyToClipboard } = useCopy(answerText)
  const contentNullOrEmpty = answerText === ""
  const turn = turnFromParts(parts)
  const { openCanvas } = useWorkspace()
  const handleOpenInCanvas = useCallback(async () => {
    if (contentNullOrEmpty) return
    const res = await fetch("/api/cloud9/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled", content: answerText }),
    })
    if (!res.ok) return
    const canvas = await res.json()
    openCanvas(canvas.id, canvas.title, canvas.content)
  }, [contentNullOrEmpty, answerText, openCanvas])

  const isQuoteEnabled = !preferences.multiModelEnabled
  const messageRef = useRef<HTMLDivElement>(null)
  const { selectionInfo, clearSelection } = useAssistantMessageSelection(
    messageRef,
    isQuoteEnabled
  )
  const handleQuoteBtnClick = useCallback(() => {
    if (selectionInfo && onQuote) {
      onQuote(selectionInfo.text, selectionInfo.messageId)
      clearSelection()
    }
  }, [selectionInfo, onQuote, clearSelection])

  // Nothing to draw yet: the conversation shows the single placeholder row.
  const notices = parts.flatMap((p) =>
    p.type === "data-notice" ? [(p as { data?: { text?: string } }).data?.text ?? ""] : []
  )
  if (!parts.some(isVisiblePart) && notices.length === 0) return null

  return (
    <Message
      from="assistant"
      className={cn(
        // No side padding of its own on a phone: with the list's px-4 and the
        // page's p-4 it added up to a 56px gutter each side and a 278px column
        // on a 390px screen, so a 4-column table showed 3.
        "group flex w-full max-w-3xl flex-1 items-start gap-4 px-0 pb-2 sm:px-6",
        hasScrollAnchor && "min-h-scroll-anchor",
        className
      )}
    >
      <div
        ref={messageRef}
        className="relative flex w-full min-w-0 max-w-full flex-col gap-2"
        {...(isQuoteEnabled && { "data-message-id": messageId })}
      >
        {notices.map((text, i) => (
          <p
            key={`notice-${i}`}
            role="status"
            className="text-muted-foreground bg-muted/50 w-fit rounded-md px-2 py-1 text-xs"
          >
            {text}
          </p>
        ))}
        {toBlocks(parts).map((block, i) =>
          block.kind === "tools" ? (
            preferences.showToolInvocations ? (
              <ToolGroup
                key={i}
                parts={block.parts}
                streaming={streaming}
                timings={turn?.tools}
              />
            ) : null
          ) : block.kind === "reasoning" ? (
            <ReasoningBlock key={i} part={block.part} />
          ) : (
            parseCanvasSegments(block.text).map((segment, j) =>
              segment.kind === "canvas" ? (
                <CanvasBlock
                  key={`${i}-${j}`}
                  title={segment.title}
                  content={segment.content}
                  complete={segment.complete}
                  streaming={streaming}
                />
              ) : segment.text.trim() ? (
                <MessageContent
                  key={`${i}-${j}`}
                  className={cn(
                    // `anywhere`, not `break-word`: only the former lowers the
                    // min-content width, so a bare URL wraps instead of being
                    // clipped by the overflow-hidden wrapper at phone width.
                    // Tables are reset: their wrapper scrolls sideways, and
                    // `anywhere` inherited into cells split "deepseek" into
                    // three-letter lines.
                    "prose dark:prose-invert relative w-full min-w-0 max-w-full bg-transparent p-0 [overflow-wrap:anywhere] [&_table]:[overflow-wrap:normal]",
                    "prose-p:text-base prose-p:leading-7 prose-li:text-base prose-li:leading-7 prose-h1:scroll-m-20 prose-h1:text-2xl prose-h1:font-semibold prose-h2:mt-8 prose-h2:scroll-m-20 prose-h2:text-xl prose-h2:mb-3 prose-h2:font-medium prose-h3:scroll-m-20 prose-h3:text-lg prose-h3:font-medium prose-h4:scroll-m-20 prose-h5:scroll-m-20 prose-h6:scroll-m-20 prose-strong:font-medium prose-table:block prose-table:overflow-y-auto"
                  )}
                >
                  <MessageResponse>{segment.text}</MessageResponse>
                </MessageContent>
              ) : null
            )
          )
        )}

        {streaming || contentNullOrEmpty ? null : (
          <MessageActions
            className={cn(
              // Visible by default, hover-revealed only from md up: a touch
              // screen has no hover, so a hover-only row is unreachable there.
              "-ml-2 flex gap-0 transition-opacity",
              "opacity-100 md:opacity-0 md:group-hover:opacity-100"
            )}
          >
            <MessageAction
              tooltip={copied ? "Copied!" : "Copy text"}
              label="Copy text"
              className="hover:bg-accent/60 text-muted-foreground hover:text-foreground rounded-full bg-transparent"
              onClick={copyToClipboard}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </MessageAction>
            <MessageAction
              tooltip="Open in canvas"
              label="Open in canvas"
              className="hover:bg-accent/60 text-muted-foreground hover:text-foreground rounded-full bg-transparent"
              onClick={handleOpenInCanvas}
            >
              <FileText className="size-4" />
            </MessageAction>
            <ReadAloudAction text={answerText} />
            <MessageFeedback messageId={messageId} />
          </MessageActions>
        )}

        {isQuoteEnabled && selectionInfo && selectionInfo.messageId && (
          <QuoteButton
            mousePosition={selectionInfo.position}
            onQuote={handleQuoteBtnClick}
            messageContainerRef={messageRef}
            onDismiss={clearSelection}
          />
        )}
      </div>
    </Message>
  )
}, (a, b) =>
  a.id === b.id &&
  a.parts === b.parts &&
  a.streaming === b.streaming &&
  a.hasScrollAnchor === b.hasScrollAnchor &&
  a.className === b.className &&
  a.onQuote === b.onQuote
)

// Speaks the answer through /api/voice/speech. Tap again
// to stop. The Audio element is created and play()ed inside the tap itself:
// iOS Safari only lets an element play if it was started from a gesture, and
// by the time the fetch returns the gesture is gone.
// 0.05s of silence, 8kHz mono PCM: the shortest thing that is a real media
// source, so the tap counts as a play for the autoplay policy.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ4AAACAgICAgICAgICAgICAgA=="

function ReadAloudAction({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle")
  const audio = useRef<HTMLAudioElement | null>(null)

  const stop = useCallback(() => {
    const a = audio.current
    audio.current = null
    if (a) {
      a.pause()
      if (a.src.startsWith("blob:")) URL.revokeObjectURL(a.src)
    }
    setState("idle")
  }, [])

  useEffect(() => stop, [stop])

  const start = async () => {
    const a = new Audio()
    // Unlock with a real (silent) source, not an empty element: play() with no
    // src REJECTS, which Firefox and Brave count as "never played", so the
    // first chunk then hits their autoplay block once the tap is long gone.
    a.src = SILENT_WAV
    a.play().catch(() => {})
    audio.current = a
    setState("loading")

    // Kokoro synthesises at about real time on our CPU, so rendering the whole
    // answer first means waiting out its own length in silence. One chunk at a
    // time, with the next one rendering while this one plays.
    const render = async (chunk: string) => {
      const res = await fetch("/api/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      return URL.createObjectURL(await res.blob())
    }

    try {
      const chunks = chunkForSpeech(text)
      // ONE render at a time. Two in flight was measured worse, not better
      // (6.4s to first sound against 3.3s): speaches is CPU-bound on a shared
      // three cores, so a second request steals from the one being waited on.
      // The gap is closed by chunk SIZE instead -- synthesis runs at about 0.6x
      // real time, so the next chunk lands before the current one finishes.
      let pending = chunks.length ? render(chunks[0]) : null
      for (let i = 0; pending; i++) {
        const url = await pending
        pending = i + 1 < chunks.length ? render(chunks[i + 1]) : null
        if (audio.current !== a) return URL.revokeObjectURL(url) // stopped meanwhile
        a.src = url
        setState("playing")
        await new Promise<void>((resolve, reject) => {
          a.onended = () => resolve()
          a.onerror = () => reject(new Error("playback failed"))
          a.play().catch(reject)
        })
        URL.revokeObjectURL(url)
      }
      if (audio.current === a) stop()
    } catch (err) {
      if (audio.current === a) {
        stop()
        toast({ title: `Read aloud failed: ${(err as Error).message}`, status: "error" })
      }
    }
  }

  const active = state !== "idle"
  return (
    <MessageAction
      tooltip={active ? "Stop reading" : "Read aloud"}
      label={active ? "Stop reading" : "Read aloud"}
      className="hover:bg-accent/60 text-muted-foreground hover:text-foreground rounded-full bg-transparent"
      onClick={() => (active ? stop() : void start())}
    >
      {state === "loading" ? (
        <Spinner />
      ) : state === "playing" ? (
        <StopIcon className="size-4" />
      ) : (
        <SpeakerHighIcon className="size-4" />
      )}
    </MessageAction>
  )
}
