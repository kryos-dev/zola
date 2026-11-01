"use client"

import { PersonaAvatar } from "@/app/components/layout/persona-switcher"
import { VoiceOrb, type VoicePhase } from "@/app/components/voice/voice-orb"
import { useProfiles } from "@/app/hooks/use-profiles"
import { recordingFormat } from "@/app/components/chat-input/dictation"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { takeSpeech } from "@/lib/voice-sentences"
import { cn } from "@/lib/utils"
import { MicrophoneIcon, MicrophoneSlashIcon, XIcon } from "@phosphor-icons/react"
import type { UIMessage } from "ai"
import { useEffect, useRef, useState } from "react"

const LANG_KEY = "kryos-voice-lang"
const LANGS = [
  { code: "en-IN", label: "EN" },
  { code: "ta-IN", label: "TA" },
] as const
// Fallback recorder: stop after this much silence once speech was heard, or at the cap.
const SILENCE_MS = 1400
const MAX_RECORD_MS = 30_000
const SPEECH_LEVEL = 0.06

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onsoundstart: (() => void) | null
  onspeechstart: (() => void) | null
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

// One audio element for the whole app session: a browser that wants a user
// gesture to start playback unlocks it once, and it stays unlocked when voice
// mode remounts (a persona switch rebuilds the chat view).
let sharedAudio: HTMLAudioElement | undefined
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
function audioEl() {
  return (sharedAudio ??= new Audio())
}

declare global {
  interface Window {
    SpeechRecognition?: unknown
    webkitSpeechRecognition?: unknown
  }
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
  const [lang, setLang] = useState<string>(LANGS[0].code)
  const [muted, setMuted] = useState(false)
  const orbRef = useRef<HTMLButtonElement>(null)

  // Everything the callbacks below need lives in refs so they never go stale.
  const mutedRef = useRef(false)
  const langRef = useRef<string>(LANGS[0].code)
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
      fetch("/api/voice/speech", {
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
    const SR = (window.SpeechRecognition ?? window.webkitSpeechRecognition) as
      | (new () => Recognition)
      | undefined
    let stream: MediaStream | undefined
    let ctx: AudioContext | undefined
    let raf = 0
    let rec: Recognition | undefined
    let recorder: MediaRecorder | undefined
    let ended = false
    let heard = ""

    const teardown = () => {
      ended = true
      cancelAnimationFrame(raf)
      orbRef.current?.style.setProperty("--orb-level", "0")
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => {})
      stopListening.current = null
    }
    // Stops capture; what was heard so far is sent (SpeechRecognition) or uploaded (recorder).
    stopListening.current = () => {
      if (ended) return
      if (rec) {
        rec.onend = null
        rec.stop()
        teardown()
        submit(heard)
      } else if (recorder?.state === "recording") recorder.stop()
      else teardown()
    }

    // Recorder path: opens the mic itself, meters its level and stops on silence.
    const record = async () => {
      cancelAnimationFrame(raf)
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
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        level = Math.max(Math.sqrt(sum / buf.length) * 3, level * 0.85)
        orbRef.current?.style.setProperty("--orb-level", Math.min(1, level).toFixed(2))
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
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: form })
          const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
          if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          if (g === gen.current) submit(body.text ?? "")
        } catch (err) {
          toast({ title: `Transcription failed: ${(err as Error).message}`, status: "error" })
          setPhase("idle")
        }
      }
      recorder.start()
      raf = requestAnimationFrame(tick)
    }

    if (!SR) return void record()

    // Recognizer path: the recognizer owns the microphone (Android runs it in a
    // separate app), so we open no stream; the orb pulses on recognizer events.
    setPhase("listening")
    setCaption("")
    let pulse = 0
    const decay = () => {
      pulse *= 0.9
      orbRef.current?.style.setProperty("--orb-level", pulse.toFixed(2))
      raf = requestAnimationFrame(decay)
    }
    raf = requestAnimationFrame(decay)
    rec = new SR()
    rec.lang = langRef.current
    rec.interimResults = true
    rec.continuous = false
    rec.onsoundstart = rec.onspeechstart = () => {
      pulse = 0.7
    }
    rec.onresult = (e) => {
      pulse = 0.7
      heard = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ")
      setCaption(heard)
    }
    rec.onerror = (e) => {
      if (ended) return
      rec!.onend = null
      rec = undefined
      // The recognizer cannot work here; the recorder path does the job.
      if (["audio-capture", "service-not-allowed", "network", "language-not-supported"].includes(e.error)) {
        return void record()
      }
      teardown()
      if (e.error === "not-allowed") toast({ title: "Microphone permission denied", status: "error" })
      else if (e.error !== "no-speech" && e.error !== "aborted") {
        toast({ title: `Voice error: ${e.error}`, status: "error" })
      }
      setPhase("idle")
    }
    rec.onend = () => {
      if (ended) return
      rec = undefined
      teardown()
      submit(heard)
    }
    rec.start()
  }

  // Mount: restore the language, start listening when opened by a tap. Unmount
  // (close, or a persona switch rebuilding the chat) stops everything.
  useEffect(() => {
    const stored = localStorage.getItem(LANG_KEY)
    if (LANGS.some((l) => l.code === stored)) {
      langRef.current = stored!
      setLang(stored!)
    }
    if (autoStart) {
      audioEl().src = SILENT_WAV
      void audioEl().play().catch(() => {})
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
    audioEl().src = SILENT_WAV
    void audioEl().play().catch(() => {})
    listen.current()
  }

  const pickLang = (code: string) => {
    langRef.current = code
    setLang(code)
    localStorage.setItem(LANG_KEY, code)
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
        <VoiceOrb ref={orbRef} phase={phase} onClick={onOrb} />
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
          <div className="flex rounded-full border p-0.5" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                aria-pressed={lang === l.code}
                onClick={() => pickLang(l.code)}
                className={cn(
                  "h-8 min-w-10 rounded-full px-3 text-sm font-medium",
                  lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Button
            variant={muted ? "destructive" : "outline"}
            size="icon"
            className="rounded-full"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Hands-free off, tap to turn on" : "Hands-free on, tap to turn off"}
          >
            {muted ? <MicrophoneSlashIcon className="size-5" /> : <MicrophoneIcon className="size-5" />}
          </Button>
          <Button variant="outline" size="icon" className="rounded-full" onClick={onClose} aria-label="Close voice mode">
            <XIcon className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
