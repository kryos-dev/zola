"use client"

import {
  isServableMediaPath,
  mediaKind,
  mediaName,
  mediaSrcUrl,
} from "@/lib/media-tags"
import { cn } from "@/lib/utils"
import { FileText } from "@phosphor-icons/react"

// A file an answer delivered with a `MEDIA:` tag, rendered where the tag was.
// Before this, the tag printed as its own paragraph -- the raw path, no file.
// The bytes are streamed by /api/media, which reads them off the Hermes host.
export function MediaBlock({ path, className }: { path: string; className?: string }) {
  const name = mediaName(path)

  // A relative path has no meaning without the session's cwd, and this app has
  // no session cwd to give it. Name the file rather than show a broken frame.
  if (!isServableMediaPath(path)) return <FileChip name={path} className={className} />

  const src = mediaSrcUrl(path)
  const kind = mediaKind(path)

  if (kind === "image") {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("block w-fit max-w-full", className)}
      >
        {/* Loaded eagerly, not lazily: a delivered file is the point of the
            message, and inside this app's scroll container the lazy observer
            never fired, so the tag would be replaced by a blank frame -- the
            same "it's broken" reading as the raw path was. `decoding=async`
            keeps the paint smooth instead. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- streamed from
            a same-origin route, not a static asset, so next/image has nothing
            to optimise and would need a remote-pattern entry. */}
        <img
          src={src}
          alt={name}
          decoding="async"
          className="border-border bg-muted/40 max-h-[32rem] w-auto max-w-full rounded-xl border object-contain"
        />
      </a>
    )
  }

  if (kind === "video") {
    return (
      <video
        controls
        preload="metadata"
        src={src}
        className={cn("border-border max-h-[32rem] max-w-full rounded-xl border", className)}
      />
    )
  }

  if (kind === "audio") {
    return <audio controls preload="metadata" src={src} className={cn("w-full max-w-md", className)} />
  }

  return <FileChip name={name} href={src} className={className} />
}

function FileChip({
  name,
  href,
  className,
}: {
  name: string
  href?: string
  className?: string
}) {
  const body = (
    <>
      <FileText className="size-4 shrink-0" />
      <span className="truncate">{name}</span>
    </>
  )
  const shell =
    "border-border bg-muted/40 text-foreground hover:bg-muted inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors no-underline"

  return href ? (
    <a href={href} download={name} className={cn(shell, className)}>
      {body}
    </a>
  ) : (
    <span className={cn(shell, "text-muted-foreground", className)}>{body}</span>
  )
}
