import { cn } from "@/lib/utils"
import type { Ref } from "react"

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking"

// State drives colour and motion; the listening scale comes from --orb-level,
// which voice-mode.tsx writes on `ref` from the microphone level.
const TONE: Record<VoicePhase, string> = {
  idle: "from-slate-300 to-slate-500 shadow-slate-400/30 dark:from-slate-500 dark:to-slate-700",
  listening: "from-emerald-300 to-emerald-600 shadow-emerald-500/40",
  thinking: "from-amber-300 to-orange-500 shadow-amber-500/40",
  speaking: "from-sky-300 to-indigo-600 shadow-indigo-500/40",
}

export function VoiceOrb({
  phase,
  onClick,
  ref,
}: {
  phase: VoicePhase
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={
        phase === "idle"
          ? "Start listening"
          : phase === "listening"
            ? "Send what you said"
            : "Interrupt and speak"
      }
      className="focus-visible:ring-ring relative flex size-52 items-center justify-center rounded-full outline-none focus-visible:ring-2 sm:size-64"
    >
      <span
        className={cn(
          "absolute inset-6 rounded-full bg-gradient-to-br shadow-[0_0_80px_20px] transition-colors duration-500",
          TONE[phase],
          phase !== "thinking" && `orb-${phase}`
        )}
      />
      {phase === "thinking" ? (
        <span className="orb-thinking absolute inset-3 rounded-full border-4 border-amber-400/70 border-t-transparent" />
      ) : null}
    </button>
  )
}
