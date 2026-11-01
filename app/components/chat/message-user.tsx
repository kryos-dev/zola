"use client"

import {
  MessageAction,
  MessageActions,
  Message as MessageContainer,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogImage,
  MorphingDialogTrigger,
} from "@/components/motion-primitives/morphing-dialog"
import {
  attachmentsFromMessage,
  textFromMessage,
} from "@/lib/hermes/types"
import { cn } from "@/lib/utils"
import { splitMediaSegments } from "@/lib/media-tags"
import { Check, Copy } from "@phosphor-icons/react"
import { MediaBlock } from "./media-block"
import type { UIMessage } from "ai"
import Image from "next/image"
import React from "react"
import { useCopy } from "./utils"

const getTextFromDataUrl = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1]
  return base64
}

export type MessageUserProps = {
  hasScrollAnchor?: boolean
  parts: UIMessage["parts"]
  className?: string
}

// A message never changes once sent, so id, parts and the anchor flag are the
// whole identity; streaming another message does not re-render this one.
export const MessageUser = React.memo(function MessageUser({
  hasScrollAnchor,
  parts,
  className,
}: MessageUserProps & { id: string }) {
  const children = textFromMessage({ parts })
  const { copied, copy: copyToClipboard } = useCopy(children)
  const attachments = attachmentsFromMessage({ parts })
  return (
    <MessageContainer
      from="user"
      className={cn(
        // Same gutter fix as message-assistant: 56px each side at 390px.
        "group flex w-full max-w-3xl flex-col items-end gap-0.5 px-0 pb-2 sm:px-6",
        hasScrollAnchor && "min-h-scroll-anchor",
        className
      )}
    >
      {attachments?.map((attachment, index) => (
        <div
          className="flex flex-row gap-2"
          key={`${attachment.name}-${index}`}
        >
          {attachment.contentType?.startsWith("image") ? (
            <MorphingDialog
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}
            >
              <MorphingDialogTrigger className="z-10">
                <Image
                  className="mb-1 w-40 rounded-md"
                  key={attachment.name}
                  src={attachment.url}
                  alt={attachment.name || "Attachment"}
                  width={160}
                  height={120}
                />
              </MorphingDialogTrigger>
              <MorphingDialogContainer>
                <MorphingDialogContent className="relative rounded-lg">
                  <MorphingDialogImage
                    src={attachment.url}
                    alt={attachment.name || ""}
                    className="max-h-[90vh] max-w-[90vw] object-contain"
                  />
                </MorphingDialogContent>
                <MorphingDialogClose className="text-primary" />
              </MorphingDialogContainer>
            </MorphingDialog>
          ) : attachment.contentType?.startsWith("text") ? (
            <div className="text-primary mb-3 h-24 w-40 overflow-hidden rounded-md border p-2 text-sm">
              {getTextFromDataUrl(attachment.url)}
            </div>
          ) : null}
        </div>
      ))}
      <MessageContent
        // Not `break-words` as well: both set overflow-wrap, `break-word`
        // won, and a pasted URL ran out of the bubble (390px).
        className="bg-accent prose dark:prose-invert text-base leading-7 relative max-w-3/4 rounded-3xl px-5 py-2.5 [overflow-wrap:anywhere]"
      >
        {splitMediaSegments(children).map((segment, index) =>
          segment.kind === "media" ? (
            <MediaBlock key={`media-${index}`} path={segment.path} />
          ) : segment.text.trim() ? (
            <MessageResponse
              key={`text-${index}`}
              components={{
                code: ({ children }) => <React.Fragment>{children}</React.Fragment>,
                pre: ({ children }) => <React.Fragment>{children}</React.Fragment>,
                h1: ({ children }) => <p>{children}</p>,
                h2: ({ children }) => <p>{children}</p>,
                h3: ({ children }) => <p>{children}</p>,
                h4: ({ children }) => <p>{children}</p>,
                h5: ({ children }) => <p>{children}</p>,
                h6: ({ children }) => <p>{children}</p>,
                p: ({ children }) => <p>{children}</p>,
                li: ({ children }) => <p>- {children}</p>,
                ul: ({ children }) => <React.Fragment>{children}</React.Fragment>,
                ol: ({ children }) => <React.Fragment>{children}</React.Fragment>,
              }}
            >
              {segment.text}
            </MessageResponse>
          ) : null
        )}
      </MessageContent>
      {/* Visible on touch, hover-revealed from md up: a phone never fires
          hover, so copy was unreachable here. See #31. */}
      <MessageActions className="flex gap-0 opacity-100 transition-opacity duration-0 md:opacity-0 md:group-hover:opacity-100">
        <MessageAction
          tooltip={copied ? "Copied!" : "Copy text"}
          label="Copy text"
          className="hover:bg-accent/60 text-muted-foreground hover:text-foreground rounded-full bg-transparent"
          onClick={copyToClipboard}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </MessageAction>
      </MessageActions>
    </MessageContainer>
  )
}, (a, b) =>
  a.id === b.id &&
  a.parts === b.parts &&
  a.hasScrollAnchor === b.hasScrollAnchor &&
  a.className === b.className
)
