import {
  Conversation as ConversationRoot,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import type { ZolaUIMessage } from "@/lib/hermes/types"
import { X, RotateCcw } from "lucide-react"
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { MessageAssistant } from "./message-assistant"
import { MessageUser } from "./message-user"
import { isVisiblePart } from "./utils"

type QueuedMessageView = {
  id: string
  text: string
  filenames: string[]
  state: "queued" | "sending" | "failed"
}

type ConversationProps = {
  messages: ZolaUIMessage[]
  status?: "streaming" | "ready" | "submitted" | "error"
  onQuote?: (text: string, messageId: string) => void
  queuedMessages?: QueuedMessageView[]
  queuedAfter?: string
  onRemoveQueued?: (id: string) => void
  onRetryQueued?: (id: string) => void
  // Solid header cover over the list on phones. Off where the page already
  // pads for the app header, else it blanks the first message.
  topMask?: boolean
  /** Scroll-back: older rows exist; the top sentinel asks for them. */
  hasOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
  /** Where compacted history begins: an "Earlier" divider is drawn above this message. */
  dividerBeforeId?: string
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

export function Conversation({
  messages,
  status = "ready",
  onQuote,
  queuedMessages = [],
  queuedAfter,
  onRemoveQueued,
  onRetryQueued,
  topMask = true,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
  dividerBeforeId,
}: ConversationProps) {
  // Messages present at mount; a busy last message that is not one of them is
  // the live reply and gets the scroll anchor.
  const initialLastId = useRef(messages.at(-1)?.id)

  // Scroll-back: when the sentinel at the top comes into view, load the next
  // older page; after it is prepended the scroll offset is shifted by the
  // height it added so the reader stays on the same message.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ el: HTMLElement; height: number; top: number } | null>(null)
  const onLoadOlderRef = useRef(onLoadOlder)
  onLoadOlderRef.current = onLoadOlder
  const firstId = messages[0]?.id
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasOlder || loadingOlder) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        const el = scrollParent(node)
        if (el) anchor.current = { el, height: el.scrollHeight, top: el.scrollTop }
        onLoadOlderRef.current?.()
      },
      { rootMargin: "200px 0px 0px 0px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasOlder, loadingOlder, firstId])
  useLayoutEffect(() => {
    const a = anchor.current
    if (!a) return
    anchor.current = null
    a.el.scrollTop = a.top + (a.el.scrollHeight - a.height)
  }, [firstId])
  const busy = status === "submitted" || status === "streaming"
  const last = messages[messages.length - 1]
  const waiting =
    busy &&
    messages.length > 0 &&
    (last.role !== "assistant" || !last.parts.some(isVisiblePart))

  // Message is memoised on the fields that drive its output and the callbacks
  // are deliberately not among them; a ref hands each Message a stable wrapper
  // that always calls the newest one.
  const onQuoteRef = useRef(onQuote)
  onQuoteRef.current = onQuote
  const stableOnQuote = useCallback(
    (text: string, messageId: string) => onQuoteRef.current?.(text, messageId),
    []
  )

  if (!messages || messages.length === 0)
    return <div className="h-full w-full"></div>

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto">
      {topMask ? (
        // Cover content as it scrolls beneath the transparent mobile header.
        // A second, fading header layer left prose half-visible behind the bar:
        // letters became gray and looked clipped mid-message. One solid layer
        // keeps the controls readable and makes covered text disappear cleanly.
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 mx-auto flex w-full flex-col justify-start">
          <div className="h-app-header bg-background w-full lg:hidden" />
        </div>
      ) : null}
      <ConversationRoot className="relative w-full">
        <ConversationContent
          className="flex w-full flex-col pt-20 pb-4"
          style={{
            scrollbarGutter: "stable both-edges",
            scrollbarWidth: "none",
          }}
        >
          <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 px-4">
            <div ref={sentinelRef} aria-hidden className="-mb-6 h-px" />
            {loadingOlder && (
              <p className="text-muted-foreground text-center text-xs">Loading earlier messages...</p>
            )}
            {messages.map((message, index) => {
              const isLast = index === messages.length - 1
              // The anchor's min-height (about a screen) lets the new question
              // scroll to the top while its reply streams, and is dropped when
              // it ends so a short answer leaves no blank screen under it.
              const hasScrollAnchor =
                isLast && busy && message.id !== initialLastId.current

              const divider =
                message.id === dividerBeforeId ? (
                  <div
                    role="separator"
                    className="text-muted-foreground flex items-center gap-3 text-xs"
                  >
                    <span className="bg-border h-px flex-1" />
                    Earlier
                    <span className="bg-border h-px flex-1" />
                  </div>
                ) : null
              const item = (() => {
              if (message.role === "user")
                return (
                  <MessageUser
                    key={message.id}
                    id={message.id}
                    parts={message.parts}
                    hasScrollAnchor={hasScrollAnchor}
                  />
                )
              if (message.role === "assistant")
                return (
                  <MessageAssistant
                    key={message.id}
                    id={message.id}
                    parts={message.parts}
                    streaming={isLast && busy}
                    hasScrollAnchor={hasScrollAnchor}
                    onQuote={stableOnQuote}
                  />
                )
              return null
              })()
              return (
                <Fragment key={message.id}>
                  {divider}
                  {item}
                </Fragment>
              )
            })}
            {/* The one placeholder: a reply is pending and nothing of it is
                drawable yet. Same gutters as the assistant message, so the
                first real part replaces it in place. */}
            {waiting && (
              <div className="group min-h-scroll-anchor flex w-full min-w-0 max-w-3xl flex-col items-start gap-2 px-0 sm:px-6">
                <div className="text-muted-foreground py-1 text-sm">
                  <Shimmer as="span">Thinking…</Shimmer>
                </div>
              </div>
            )}
            {queuedMessages.length > 0 && (
              <section
                aria-label="Queued follow-up messages"
                className="border-primary/40 bg-primary/5 mx-auto w-full max-w-3xl rounded-xl border border-dashed p-3 sm:px-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-primary text-sm font-medium">
                    Next in this chat · {queuedMessages.length} queued
                  </p>
                  <span className="text-muted-foreground text-xs">
                    Sends after the current reply
                  </span>
                </div>
                {queuedAfter ? (
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    Waiting on: {queuedAfter}
                  </p>
                ) : null}
                <ol className="mt-3 space-y-2 border-l-2 border-dashed border-primary/30 pl-3">
                  {queuedMessages.map((item, index) => (
                    <li
                      key={item.id}
                      className="bg-background/80 flex min-w-0 items-start justify-between gap-3 rounded-lg border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground text-xs font-medium">
                          {item.state === "sending"
                            ? "Sending next…"
                            : item.state === "failed"
                              ? "Couldn’t send · queued"
                              : `Queued ${index + 1}`}
                        </p>
                        {item.text.trim() ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm">{item.text}</p>
                        ) : null}
                        {item.filenames.length > 0 ? (
                          <p className="text-muted-foreground mt-1 truncate text-xs">
                            Attachment{item.filenames.length === 1 ? "" : "s"}: {item.filenames.join(", ")}
                          </p>
                        ) : null}
                        {item.state === "failed" ? (
                          <button
                            type="button"
                            className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                            onClick={() => onRetryQueued?.(item.id)}
                          >
                            <RotateCcw className="size-3" /> Retry
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove queued message ${index + 1}`}
                        disabled={item.state === "sending"}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                        onClick={() => onRemoveQueued?.(item.id)}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </ConversationContent>
        <div className="absolute bottom-0 mx-auto flex w-full max-w-3xl flex-1 items-end justify-end gap-4 px-4 pb-2">
          <ConversationScrollButton className="absolute -top-12.5 right-7.5 bottom-auto left-auto translate-x-0" />
        </div>
      </ConversationRoot>
    </div>
  )
}
