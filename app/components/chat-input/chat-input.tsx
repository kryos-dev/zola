"use client"

import { APP_NAME } from "@/lib/config"

import { ModelSelector } from "@/components/common/model-selector/base"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input"
import { Button } from "@/components/ui/button"
import { ArrowUpIcon, StopIcon, WaveformIcon } from "@phosphor-icons/react"
import { ListPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PromptSystem } from "../suggestions/prompt-system"
import { ButtonFileUpload } from "./button-file-upload"
import { FileList } from "./file-list"
import { ThinkingEffortSelect } from "./thinking-effort-select"
import { ContextMeter } from "./context-meter"
import { matchCommands, parseSlash, type SlashCommand } from "./slash-commands"
import { SlashMenu } from "./slash-menu"
import { chatSendIntent } from "@/lib/chat-send-intent"
import type { LanguageModelUsage } from "ai"

type ChatInputProps = {
  value: string
  onValueChange: (value: string) => void
  onSend: () => void
  isSubmitting?: boolean
  hasMessages?: boolean
  files: File[]
  onFileUpload: (files: File[]) => void
  onFileRemove: (file: File) => void
  onSuggestion: (suggestion: string) => void
  hasSuggestions?: boolean
  onSelectModel: (model: string) => void
  selectedModel: string
  isUserAuthenticated: boolean
  stop: () => void | Promise<void>
  status?: "submitted" | "streaming" | "ready" | "error"
  quotedText?: { text: string; messageId: string } | null
  reasoningEffort?: string
  onReasoningEffortChange?: (effort: string) => void
  /** Opens the full-screen voice conversation. */
  onVoiceMode?: () => void
  turnUsage?: LanguageModelUsage
}

export function ChatInput({
  value,
  onValueChange,
  onSend,
  isSubmitting,
  files,
  onFileUpload,
  onFileRemove,
  onSuggestion,
  hasSuggestions,
  onSelectModel,
  selectedModel,
  isUserAuthenticated,
  stop,
  status,
  quotedText,
  reasoningEffort,
  onReasoningEffortChange,
  onVoiceMode,
  turnUsage,
}: ChatInputProps) {
  // Hermes accepts text and image parts only (client.ts sends images); other
  // files are stored on disk and referenced by path.
  const fileAccept =
    "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(async () => {
    const intent = chatSendIntent(status ?? "ready", value, files.length)
    if (isSubmitting || intent === "ignore") return

    // Active turns queue a follow-up instead of being interrupted. An empty
    // composer still uses the same control to stop the current response.
    if (intent === "stop") {
      await stop()
      return
    }

    onSend()
  }, [files, isSubmitting, onSend, status, stop, value])

  // Slash commands. `parseSlash` returns null for anything that is not a
  // command being typed on the first line, so an ordinary message containing a
  // slash never opens this.
  const router = useRouter()
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const slash = parseSlash(value)
  const slashTyped = slash?.typed
  const slashCommands = useMemo(
    () => (slashTyped === undefined ? [] : matchCommands(slashTyped)),
    [slashTyped]
  )
  const slashOpen = !slashDismissed && slashCommands.length > 0

  // Escape dismisses the menu, and typing a fresh `/` brings it back.
  useEffect(() => {
    if (!value.startsWith("/")) setSlashDismissed(false)
    setSlashIndex(0)
  }, [value])

  const runSlash = useCallback(
    (command: SlashCommand) => {
      command.run({
        setValue: onValueChange,
        rest: slash?.rest ?? "",
        setReasoningEffort: onReasoningEffortChange,
        newChat: () => router.push("/"),
        send: onSend,
      })
      setSlashDismissed(true)
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    [
      onValueChange,
      slash?.rest,
      onReasoningEffortChange,
      router,
      onSend,
    ]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isSubmitting) {
        e.preventDefault()
        return
      }

      // The menu owns these keys while it is open, and must be checked BEFORE
      // the Enter-to-send branch below or picking a command would send the
      // half-typed command as a message.
      if (slashOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setSlashIndex((i) => (i + 1) % slashCommands.length)
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setSlashIndex(
            (i) => (i - 1 + slashCommands.length) % slashCommands.length
          )
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          setSlashDismissed(true)
          return
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          runSlash(slashCommands[slashIndex] ?? slashCommands[0])
          return
        }
        if (e.key === "Tab") {
          e.preventDefault()
          runSlash(slashCommands[slashIndex] ?? slashCommands[0])
          return
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (chatSendIntent("ready", value, files.length) === "ignore") {
          e.preventDefault()
          return
        }

        e.preventDefault()
        // handleSend, not onSend: mid-stream it stops the running turn first.
        void handleSend()
      }
    },
    [
      isSubmitting,
      handleSend,
      value,
      files,
      slashOpen,
      slashCommands,
      slashIndex,
      runSlash,
    ]
  )

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const hasImageContent = Array.from(items).some((item) =>
        item.type.startsWith("image/")
      )

      if (!isUserAuthenticated && hasImageContent) {
        e.preventDefault()
        return
      }

      if (isUserAuthenticated && hasImageContent) {
        const imageFiles: File[] = []

        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile()
            if (file) {
              const newFile = new File(
                [file],
                `pasted-image-${Date.now()}.${file.type.split("/")[1]}`,
                { type: file.type }
              )
              imageFiles.push(newFile)
            }
          }
        }

        if (imageFiles.length > 0) {
          onFileUpload(imageFiles)
        }
      }
      // Text pasting will work by default for everyone
    },
    [isUserAuthenticated, onFileUpload]
  )

  useEffect(() => {
    if (quotedText) {
      const quoted = quotedText.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
      onValueChange(value ? `${value}\n\n${quoted}\n\n` : `${quoted}\n\n`)

      requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotedText, onValueChange])

  const sendIntent = chatSendIntent(status ?? "ready", value, files.length)

  return (
    <div className="relative flex w-full flex-col gap-4">
      {hasSuggestions && (
        <PromptSystem
          onValueChange={onValueChange}
          onSuggestion={onSuggestion}
          value={value}
        />
      )}
      <div
        className="relative order-2 px-2 pb-3 sm:pb-4 md:order-1"
        onClick={() => textareaRef.current?.focus()}
      >
        <SlashMenu
          commands={slashOpen ? slashCommands : []}
          activeIndex={slashIndex}
          onSelect={runSlash}
          onHover={setSlashIndex}
        />
        <PromptInput
          className="bg-popover relative z-10 p-0 pt-1 shadow-xs backdrop-blur-xl"
          maxHeight={200}
          value={value}
          onValueChange={onValueChange}
        >
          <FileList files={files} onFileRemove={onFileRemove} />
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={`Ask ${APP_NAME}`}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="min-h-9 pt-2 pl-3 text-base leading-snug md:text-base"
          />
          <PromptInputActions className="w-full justify-between gap-1 p-1">
            {/* The left group scrolls sideways on a phone instead of pushing
                the send button off the edge. */}
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
              <ButtonFileUpload
                onFileUpload={onFileUpload}
                isUserAuthenticated={isUserAuthenticated}
                accept={fileAccept}
              />
              <ModelSelector
                selectedModelId={selectedModel}
                setSelectedModelId={onSelectModel}
                isUserAuthenticated={isUserAuthenticated}
                className="rounded-full"
              />
              {onReasoningEffortChange ? (
                <ThinkingEffortSelect
                  value={reasoningEffort ?? "auto"}
                  onChange={onReasoningEffortChange}
                />
              ) : null}
              <ContextMeter usage={turnUsage} modelId={selectedModel} />
            </div>
            <div className="flex shrink-0 items-center gap-1">
            {onVoiceMode ? (
              <Button
                size="icon-sm"
                variant="outline"
                className="rounded-full"
                type="button"
                onClick={onVoiceMode}
                aria-label="Voice mode"
              >
                <WaveformIcon className="size-4" />
              </Button>
            ) : null}
            <PromptInputAction
              tooltip={
                sendIntent === "queue"
                  ? "Queue follow-up"
                  : sendIntent === "stop"
                    ? "Stop"
                    : "Send"
              }
            >
              <Button
                size="sm"
                className="size-8 rounded-full transition-all duration-300 ease-out"
                disabled={isSubmitting || sendIntent === "ignore"}
                type="button"
                onClick={() => void handleSend()}
                aria-label={
                  sendIntent === "queue"
                    ? "Queue follow-up message"
                    : sendIntent === "stop"
                      ? "Stop response"
                      : "Send message"
                }
              >
                {sendIntent === "queue" ? (
                  <ListPlus className="size-4" />
                ) : sendIntent === "stop" ? (
                  <StopIcon className="size-4" />
                ) : (
                  <ArrowUpIcon className="size-4" />
                )}
              </Button>
            </PromptInputAction>
            </div>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  )
}
