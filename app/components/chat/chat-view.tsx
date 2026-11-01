"use client"

import { ChatInput } from "@/app/components/chat-input/chat-input"
import { Conversation } from "@/app/components/chat/conversation"
import { useFileUpload } from "@/app/components/chat/use-file-upload"
import { useModel } from "@/app/components/chat/use-model"
import { useWorkspace } from "@/app/components/workspace/workspace-provider"
import { useChatDraft } from "@/app/hooks/use-chat-draft"
import { toast } from "@/components/ui/toast"
import { getOrCreateGuestUserId } from "@/lib/api"
import { useChats } from "@/lib/chat-store/chats/provider"
import {
  fetchChatMessages,
  textFromMessage,
  type ZolaUIMessage,
} from "@/lib/chat-store/messages/api"
import { useChatSession } from "@/lib/chat-store/session/provider"
import { MESSAGE_MAX_LENGTH, SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import type { FileUIPart } from "ai"
import { API_ROUTE_CHAT } from "@/lib/routes"
import {
  normalizeThinkingEffort,
  THINKING_EFFORT_DEFAULT,
  THINKING_EFFORT_STORAGE_KEY,
} from "@/lib/thinking-effort"
import { turnFromParts } from "@/lib/turn"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { cn } from "@/lib/utils"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { AnimatePresence, motion } from "motion/react"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useQueryClient } from "@tanstack/react-query"

const transport = new DefaultChatTransport({
  api: API_ROUTE_CHAT,
  // One rolling session per user: reattach has no chat id segment.
  prepareReconnectToStreamRequest: () => ({ api: `${API_ROUTE_CHAT}/stream` }),
})
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]

const isNetworkError = (error: Error) =>
  error instanceof TypeError ||
  /Failed to fetch|NetworkError|Load failed/i.test(error.message) ||
  (typeof navigator !== "undefined" && !navigator.onLine)

type ChatViewProps = {
  /** Chat id: from the URL, or generated client-side for a chat not created yet. */
  chatKey: string
  /** The chat already exists on the server. */
  exists: boolean
  /** Rows loaded from the server; useChat starts from them and owns the list after. Undefined while loading. */
  history: ZolaUIMessage[] | undefined
  /** The server is still running a turn for this chat. */
  pending: boolean
}

export function ChatView({ chatKey, exists, history, pending }: ChatViewProps) {
  const { chatId } = useChatSession()
  const { createNewChat, getChatById, updateChatModel, bumpChat, refresh } = useChats()
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const { draftValue, clearDraft, setDraftValue } = useChatDraft(chatId)
  const { files, handleFileUploads, handleFileUpload, handleFileRemove } = useFileUpload()
  const { selectedModel, handleModelChange } = useModel({
    currentChat: (chatId && getChatById(chatId)) || null,
    user,
    updateChatModel,
    chatId,
  })
  const isAuthenticated = !!user?.id
  const systemPrompt = user?.system_prompt || SYSTEM_PROMPT_DEFAULT

  // The workspace's active canvas tab tells the agent which document it is
  // editing; the canvas editor submits through this chat's normal send path.
  const { tabs, activePath, registerCanvasInstructionHandler } = useWorkspace()
  const activeTab = tabs.find((t) => t.path === activePath)
  const activeCanvas =
    activeTab?.kind === "canvas" ? { id: activeTab.id, title: activeTab.title } : null

  const [quotedText, setQuotedText] = useState<{ text: string; messageId: string }>()
  const [input, setInput] = useState(draftValue)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const created = useRef(exists)
  const queryClient = useQueryClient()

  // Thinking effort persists across chats. It starts at the default on server
  // and client alike and reads storage after mount, so the markup matches.
  const [reasoningEffort, setReasoningEffortState] = useState(THINKING_EFFORT_DEFAULT)
  useEffect(() => {
    const stored = localStorage.getItem(THINKING_EFFORT_STORAGE_KEY)
    const normalized = normalizeThinkingEffort(stored)
    setReasoningEffortState(normalized)
    if (stored && stored !== normalized) {
      localStorage.setItem(THINKING_EFFORT_STORAGE_KEY, normalized)
    }
  }, [])
  const setReasoningEffort = (value: string) => {
    const normalized = normalizeThinkingEffort(value)
    setReasoningEffortState(normalized)
    localStorage.setItem(THINKING_EFFORT_STORAGE_KEY, normalized)
  }

  const prompt = useSearchParams().get("prompt")
  useEffect(() => {
    if (prompt) requestAnimationFrame(() => setInput(prompt))
  }, [prompt])

  const { messages, status, stop: stopStream, sendMessage, setMessages, resumeStream } = useChat<ZolaUIMessage>({
    id: chatKey,
    messages: history ?? [],
    resume: pending,
    transport,
    // One render per ~50ms instead of one per token; each render re-parses
    // the reply's markdown.
    throttle: 50,
    onFinish: () => {
      reconnectAttempts.current = 0
      reconnecting.current = false
      // The title was set when the turn started; one refresh shows it.
      void refresh()
    },
    onError: (error) => {
      if (isNetworkError(error)) {
        // The send itself failed: the question has no reply, so hand its text
        // back to the composer (and the draft, which survives a remount).
        let unanswered = ""
        setMessages((m) => {
          const last = m.at(-1)
          if (last?.role === "user") unanswered = textFromMessage(last)
          return m
        })
        if (unanswered && reconnectAttempts.current === 0) {
          setInput((current) => current || unanswered)
          setDraftValue(unanswered)
        }
        return scheduleReconnect()
      }
      const message = error.message
      toast({
        title:
          !message || message === "An error occurred" || message === "fetch failed"
            ? "Something went wrong. Please try again."
            : message,
        status: "error",
      })
    },
  })

  // A dropped connection mid-reply: the server keeps the turn running and
  // records its chunks, so the view drops the partial reply and reattaches,
  // which replays the turn from its first chunk. Retries back off 1s..16s and
  // the browser coming back online retries at once. A reattach that finds no
  // running turn means the reply is already stored: the history is refetched
  // and the view remounts on the stored rows.
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const reconnecting = useRef(false)
  const reattach = async () => {
    clearTimeout(reconnectTimer.current)
    setMessages((m) => (m.at(-1)?.role === "assistant" ? m.slice(0, -1) : m))
    await resumeStream()
    let replayed = false
    setMessages((m) => {
      replayed = m.at(-1)?.role === "assistant"
      return m
    })
    if (replayed) return
    reconnecting.current = false
    // Fetched explicitly: in a session that created its chat just now the
    // history query is disabled, and invalidating a disabled query does
    // nothing. The session still observes this key and remounts on the rows.
    void queryClient.fetchQuery({
      queryKey: ["chat-messages", chatKey],
      queryFn: () => fetchChatMessages(chatKey),
      staleTime: 0,
    })
  }
  const scheduleReconnect = () => {
    const attempt = reconnectAttempts.current
    if (attempt >= RECONNECT_DELAYS.length) {
      reconnecting.current = false
      toast({ title: "Connection lost. Please try again.", status: "error" })
      return
    }
    reconnecting.current = true
    reconnectAttempts.current = attempt + 1
    reconnectTimer.current = setTimeout(() => void reattach(), RECONNECT_DELAYS[attempt])
  }
  const reconnectRef = useRef({ reattach, scheduleReconnect })
  reconnectRef.current = { reattach, scheduleReconnect }
  useEffect(() => {
    const onOnline = () => {
      if (reconnecting.current) void reconnectRef.current.reattach()
    }
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener("online", onOnline)
      clearTimeout(reconnectTimer.current)
    }
  }, [])

  // Stop. Aborting the fetch only ends this tab's view of the turn; the server
  // keeps the run going so a reply survives a closed tab. /api/chat/abort is
  // what ends it. Awaited, since the next message may follow at once and two
  // turns on one session wedge it.
  const stop = async () => {
    void stopStream()
    if (!created.current) return
    await fetch("/api/chat/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chatKey }),
    }).catch(() => {})
  }

  // `text` overrides the composer: used by suggestions and the canvas prompt.
  const submit = async (text: string = input) => {
    if (isSubmitting) return
    if (text.length > MESSAGE_MAX_LENGTH) {
      toast({
        title: `The message you submitted was too long, please submit something shorter. (Max ${MESSAGE_MAX_LENGTH} characters)`,
        status: "error",
      })
      return
    }
    setIsSubmitting(true)
    try {
      const uid = await getOrCreateGuestUserId(user)
      if (!uid) return

      // The chat is created under the id this view already has, then the URL
      // is rewritten in place: same key, so nothing remounts mid-send.
      if (!created.current) {
        const chat = await createNewChat(
          uid,
          text,
          selectedModel,
          isAuthenticated,
          systemPrompt,
          undefined,
          chatKey
        )
        if (!chat) return
        created.current = true
        window.history.replaceState(null, "", `/c/${chat.id}`)
      }

      // On failure the files stay attached and the text stays in the composer.
      const attachments = await handleFileUploads(uid, chatKey)
      if (!attachments) return

      if (text === input) {
        setInput("")
        clearDraft()
      }
      const fileParts: FileUIPart[] = attachments.map((a) => ({
        type: "file",
        mediaType: a.contentType,
        filename: a.name,
        url: a.url,
      }))
      void sendMessage(
        { text, files: fileParts },
        {
          body: {
            chatId: chatKey,
            userId: uid,
            model: selectedModel,
            isAuthenticated,
            systemPrompt,
            reasoningEffort,
            ...(activeCanvas
              ? { canvasId: activeCanvas.id, canvasTitle: activeCanvas.title }
              : {}),
          },
        }
      )
      if (messages.length > 0) bumpChat(chatKey)
    } catch {
      toast({ title: "Failed to send message", status: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(
    () => registerCanvasInstructionHandler((text) => void submitRef.current(text)),
    [registerCanvasInstructionHandler]
  )

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  const showOnboarding = !chatId && messages.length === 0

  return (
    <div className="@container/main relative flex h-full flex-col items-center justify-end md:justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        {showOnboarding ? (
          <motion.div
            key="onboarding"
            className="absolute bottom-3/5 mx-auto max-w-200 md:relative md:bottom-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            layout="position"
            layoutId="onboarding"
            transition={{ layout: { duration: 0 } }}
          >
            <h1 className="mb-6 text-3xl font-medium tracking-tight">
              What&apos;s on your mind?
            </h1>
          </motion.div>
        ) : history === undefined ? (
          <div key="loading" className="flex w-full max-w-3xl flex-col gap-6 px-4 pt-10 sm:px-6">
            <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="h-4 w-7/12" />
          </div>
        ) : (
          <Conversation
            key="conversation"
            messages={messages}
            // Covers the gap between Enter and the request leaving, while the
            // chat is created and files are uploaded.
            status={isSubmitting && status === "ready" ? "submitted" : status}
            onQuote={(text, messageId) => setQuotedText({ text, messageId })}
          />
        )}
      </AnimatePresence>

      <motion.div
        className={cn("relative inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl")}
        layout="position"
        layoutId="chat-input-container"
        transition={{ layout: { duration: messages.length === 1 ? 0.3 : 0 } }}
      >
        <ChatInput
          value={input}
          onSuggestion={(text) => void submit(text)}
          onValueChange={(value) => {
            setInput(value)
            setDraftValue(value)
          }}
          onSend={() => void submit()}
          isSubmitting={isSubmitting || history === undefined}
          files={files}
          onFileUpload={handleFileUpload}
          onFileRemove={handleFileRemove}
          hasSuggestions={preferences.promptSuggestions && !chatId && messages.length === 0}
          onSelectModel={handleModelChange}
          selectedModel={selectedModel}
          isUserAuthenticated={isAuthenticated}
          stop={stop}
          status={status}
          quotedText={quotedText}
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={setReasoningEffort}
          turnUsage={turnFromParts(lastAssistant?.parts)?.usage}
        />
      </motion.div>
    </div>
  )
}
