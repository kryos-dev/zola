import {
  Conversation as ConversationRoot,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import type { ZolaUIMessage } from "@/lib/hermes/types"
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { MessageAssistant } from "./message-assistant"
import { MessageUser } from "./message-user"
import { isVisiblePart } from "./utils"

type ConversationProps = {
  messages: ZolaUIMessage[]
  status?: "streaming" | "ready" | "submitted" | "error"
  onQuote?: (text: string, messageId: string) => void
  // Header-height fade over the top of the list on phones. Off where the page
  // already pads for the app header, else it blanks the first message.
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
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 mx-auto flex w-full flex-col justify-center">
          <div className="h-app-header bg-background flex w-full lg:hidden lg:h-0" />
          <div className="h-app-header bg-background flex w-full mask-b-from-4% mask-b-to-100% lg:hidden" />
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
          </div>
        </ConversationContent>
        <div className="absolute bottom-0 mx-auto flex w-full max-w-3xl flex-1 items-end justify-end gap-4 px-4 pb-2">
          <ConversationScrollButton className="absolute -top-12.5 right-7.5 bottom-auto left-auto translate-x-0" />
        </div>
      </ConversationRoot>
    </div>
  )
}
