"use client"

import { PersonaAvatar } from "@/app/components/layout/persona-switcher"
import { useProfiles } from "@/app/hooks/use-profiles"
import { recordingFormat } from "@/lib/voice-recording"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { takeSpeech } from "@/lib/voice-sentences"
import { MicrophoneIcon, MicrophoneSlashIcon, XIcon } from "@phosphor-icons/react"
import type { UIMessage } from "ai"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"

// Capture stops after this much silence once speech was heard, or at the cap.
const SILENCE_MS = 1200
const MAX_RECORD_MS = 30_000
const SPEECH_LEVEL = 0.06

type VoicePhase = "idle" | "listening" | "thinking" | "speaking"
const AGENT_STATE = { idle: null, listening: "listening", thinking: "thinking", speaking: "talking" } as const

const Orb = dynamic(() => import("@/components/ui/orb").then((m) => m.Orb), { ssr: false })

// One audio element for the whole app session: a browser that wants a user
// gesture to start playback unlocks it once, and it stays unlocked when voice
// mode remounts (a persona switch rebuilds the chat view).
let sharedAudio: HTMLAudioElement | undefined
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
function audioEl() {
  return (sharedAudio ??= new Audio())
}

// An element can be connected to a MediaElementSource only once, so the output
// meter lives at module level. Null means unavailable: the orb falls back to a fixed level.
let outMeter: { ctx: AudioContext; analyser: AnalyserNode; buf: Uint8Array<ArrayBuffer> } | null | undefined
function outputMeter() {
  if (outMeter === undefined) {
    try {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      const src = ctx.createMediaElementSource(audioEl())
      src.connect(analyser)
      analyser.connect(ctx.destination)
      outMeter = { ctx, analyser, buf: new Uint8Array(analyser.fftSize) }
    } catch {
      outMeter = null
    }
  }
  return outMeter
}
function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(buf)
  let sum = 0
  for (const v of buf) sum += ((v - 128) / 128) ** 2
  return Math.sqrt(sum / buf.length)
}

type Props = {
  messages: UIMessage[]
  status: "submitted" | "streaming" | "ready" | "error"
  /** True when opened by a tap, so audio is unlocked and listening starts at once. */
  autoStart: boolean
  onSend: (text: string) => void
  onAbort: () => void
  onClose: () => void
  /** A tap happened inside voice mode, so audio is unlocked for any later remount. */
  onUnlock: () => void
}

export function VoiceMode({ messages, status, autoStart, onSend, onAbort, onClose, onUnlock }: Props) {
  const { profiles, active, switchTo } = useProfiles()
  const [phase, setPhase] = useState<VoicePhase>("idle")
  const [caption, setCaption] = useState("")
  const [muted, setMuted] = useState(false)
  const inLevel = useRef(0) // microphone level 0-1, read by the orb
  const profileRef = useRef(active)
  profileRef.current = active

  // Everything the callbacks below need lives in refs so they never go stale.
  const mutedRef = useRef(false)
  const profileUrl = (path: string) =>
    profileRef.current ? `${path}?profile=${encodeURIComponent(profileRef.current)}` : path
  const gen = useRef(0) // bumped by every new turn / interruption; stale async work checks it
  const stopListening = useRef<(() => void) | null>(null)
  const queue = useRef<Promise<string | null>[]>([])
  const playing = useRef(false)
  const awaiting = useRef(false) // a reply to the last spoken turn is expected
  const sawBusy = useRef(false)
  const replyDone = useRef(false)
  const ignoreId = useRef<string | undefined>(undefined)
  const consumed = useRef(0)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const props = useRef({ onSend, onAbort, onUnlock })
  props.current = { onSend, onAbort, onUnlock }

  // Runs inside a tap: unlocks playback and the output meter's AudioContext.
  const unlockAudio = () => {
    outputMeter()
    audioEl().src = SILENT_WAV
    void audioEl().play().catch(() => {})
  }
  const getOutputVolume = () => {
    if (!playing.current) return 0
    const m = outMeter
    return m ? Math.min(1, rms(m.analyser, m.buf) * 3) : 0.6
  }
  const getInputVolume = () => inLevel.current

  const listen = useRef<() => void>(() => {})
  const finishTurn = () => {
    awaiting.current = false
    if (mutedRef.current) setPhase("idle")
    else listen.current()
  }
  const maybeFinish = () => {
    if (awaiting.current && replyDone.current && !playing.current && !queue.current.length) {
      finishTurn()
    }
  }

  const playNext = async () => {
    if (playing.current) return
    const next = queue.current.shift()
    if (!next) return maybeFinish()
    playing.current = true
    const g = gen.current
    const url = await next
    if (g !== gen.current || !url) {
      if (url) URL.revokeObjectURL(url)
      playing.current = false
      return g === gen.current ? void playNext() : undefined
    }
    const audio = audioEl()
    void outputMeter()?.ctx.resume().catch(() => {})
    const done = () => {
      audio.onended = audio.onerror = null
      URL.revokeObjectURL(url)
      playing.current = false
      void playNext()
    }
    audio.onended = audio.onerror = done
    audio.src = url
    setPhase("speaking")
    audio.play().catch(done)
  }

  const speak = (text: string) => {
    const g = gen.current
    // Fetched at once, played in order, so synthesis overlaps playback.
    queue.current.push(
      fetch(profileUrl("/api/voice/speech"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then(async (r) => (r.ok && g === gen.current ? URL.createObjectURL(await r.blob()) : null))
        .catch(() => null)
    )
    setCaption(text)
    void playNext()
  }

  const silence = () => {
    gen.current++
    queue.current = []
    playing.current = false
    const audio = audioEl()
    audio.onended = audio.onerror = null
    audio.pause()
  }

  const submit = (text: string) => {
    const t = text.trim()
    if (!t) return setPhase("idle")
    setCaption(t)
    setPhase("thinking")
    silence()
    awaiting.current = true
    sawBusy.current = false
    replyDone.current = false
    consumed.current = 0
    ignoreId.current = messagesRef.current.findLast((m) => m.role === "assistant")?.id
    props.current.onSend(t)
  }

  listen.current = () => {
    stopListening.current?.()
    silence()
    const g = gen.current
    let stream: MediaStream | undefined
    let ctx: AudioContext | undefined
    let raf = 0
    let recorder: MediaRecorder | undefined
    let ended = false

    const teardown = () => {
      ended = true
      cancelAnimationFrame(raf)
      inLevel.current = 0
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => {})
      stopListening.current = null
    }
    // Stops capture; what was recorded so far is uploaded.
    stopListening.current = () => {
      if (ended) return
      if (recorder?.state === "recording") recorder.stop()
      else teardown()
    }

    const record = async () => {
      const format = recordingFormat()
      if (!format) {
        toast({ title: "Voice input is not supported in this browser", status: "error" })
        teardown()
        return setPhase("idle")
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        toast({ title: `Microphone unavailable: ${(err as Error).message}`, status: "error" })
        teardown()
        return setPhase("idle")
      }
      if (ended || g !== gen.current) return teardown()
      setPhase("listening")
      setCaption("")

      ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      let level = 0
      let spoke = false
      let quietSince = performance.now()
      const startedAt = performance.now()
      const tick = () => {
        level = Math.max(Math.min(1, rms(analyser, buf) * 3), level * 0.85)
        inLevel.current = level
        const now = performance.now()
        if (level > SPEECH_LEVEL) {
          spoke = true
          quietSince = now
        }
        if (
          recorder?.state === "recording" &&
          ((spoke && now - quietSince > SILENCE_MS) || now - startedAt > MAX_RECORD_MS)
        ) {
          return recorder.stop()
        }
        raf = requestAnimationFrame(tick)
      }

      const chunks: Blob[] = []
      recorder = new MediaRecorder(stream, { mimeType: format.mimeType })
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      recorder.onstop = async () => {
        const wasHeard = spoke
        teardown()
        if (g !== gen.current || !wasHeard) return setPhase("idle")
        setPhase("thinking")
        setCaption("...")
        try {
          const form = new FormData()
          form.append("file", new Blob(chunks, { type: format.mimeType }), `voice.${format.ext}`)
          const res = await fetch(profileUrl("/api/voice/transcribe"), { method: "POST", body: form })
          const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
          if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          if (g === gen.current) submit(body.text ?? "")
        } catch (err) {
          toast({ title: `Transcription failed: ${(err as Error).message}`, status: "error" })
          if (g === gen.current) setPhase("idle")
        }
      }
      recorder.start()
      raf = requestAnimationFrame(tick)
    }
    void record()
  }

  // Mount: start listening when opened by a tap. Unmount (close, or a persona
  // switch rebuilding the chat) stops everything.
  useEffect(() => {
    if (autoStart) {
      unlockAudio()
      listen.current()
    }
    return () => {
      stopListening.current?.()
      silence()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reply side: speak the assistant's text as it streams in.
  useEffect(() => {
    if (!awaiting.current) return
    if (status !== "ready") sawBusy.current = true
    const done = sawBusy.current && (status === "ready" || status === "error")
    const last = messages.at(-1)
    if (last?.role === "assistant" && last.id !== ignoreId.current) {
      const text = last.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n\n")
      const { chunks, next } = takeSpeech(text, consumed.current, done)
      consumed.current = next
      chunks.forEach(speak)
    }
    if (done) {
      replyDone.current = true
      maybeFinish()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status])

  const onOrb = () => {
    props.current.onUnlock()
    if (phase === "listening") return stopListening.current?.()
    if (phase !== "idle") {
      // Barge-in: stop the voice, stop the run, talk.
      silence()
      awaiting.current = false
      props.current.onAbort()
    }
    unlockAudio()
    listen.current()
  }
  const toggleMute = () => {
    mutedRef.current = !mutedRef.current
    setMuted(mutedRef.current)
    if (mutedRef.current && phase === "listening") stopListening.current?.()
  }

  const label =
    phase === "listening" ? "Listening" : phase === "thinking" ? "Thinking" : phase === "speaking" ? "Speaking" : "Tap the orb to talk"

  return (
    <div
      role="dialog"
      aria-label="Voice mode"
      className="bg-background fixed inset-0 z-[70] flex flex-col items-center px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <div className="flex w-full max-w-md items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {profiles.find((p) => p.name === active)?.label}
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close voice mode">
          <XIcon className="size-5" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <button
          type="button"
          onClick={onOrb}
          aria-label={label}
          className="size-[60vw] max-h-80 max-w-80 min-h-48 min-w-48 rounded-full"
        >
          <Orb
            className="relative size-full"
            agentState={AGENT_STATE[phase]}
            volumeMode="manual"
            getInputVolume={getInputVolume}
            getOutputVolume={getOutputVolume}
          />
        </button>
        <div className="flex min-h-24 w-full max-w-md flex-col items-center gap-2 text-center">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
          <p className="line-clamp-4 text-base" aria-live="polite">
            {caption}
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-4">
        {profiles.length > 1 ? (
          <div className="flex w-full justify-center gap-2 overflow-x-auto [scrollbar-width:none]">
            {profiles.map((p) => (
              <Button
                key={p.name}
                variant={p.name === active ? "secondary" : "outline"}
                size="sm"
                className="shrink-0 gap-1.5 rounded-full"
                aria-pressed={p.name === active}
                onClick={() => {
                  if (p.name === active) return
                  props.current.onUnlock()
                  silence()
                  stopListening.current?.()
                  void switchTo(p.name).catch(() =>
                    toast({ title: "Could not switch persona", status: "error" })
                  )
                }}
              >
                <PersonaAvatar label={p.label} />
                {p.label}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button
            variant={muted ? "destructive" : "outline"}
            size="icon"
            className="size-12 rounded-full"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Hands-free off, tap to turn on" : "Hands-free on, tap to turn off"}
          >
            {muted ? <MicrophoneSlashIcon className="size-5" /> : <MicrophoneIcon className="size-5" />}
          </Button>
          <Button variant="outline" size="icon" className="size-12 rounded-full" onClick={onClose} aria-label="Close voice mode">
            <XIcon className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
