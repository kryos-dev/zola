// Recording format for the voice mode recorder fallback; transcribed via
// /api/voice/transcribe.

// Container formats in preference order. Chrome/Android/Firefox record webm;
// iOS Safari records only mp4. The upload's extension has to match: OpenAI-style
// transcription endpoints judge the format by the file name.
const FORMATS = [
  { mimeType: "audio/webm;codecs=opus", ext: "webm" },
  { mimeType: "audio/webm", ext: "webm" },
  { mimeType: "audio/mp4", ext: "mp4" },
  { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
] as const

export type RecordingFormat = { mimeType: string; ext: string }

/** The first format this browser can record, or null (no MediaRecorder). */
export function recordingFormat(
  isTypeSupported: ((type: string) => boolean) | undefined = typeof MediaRecorder === "undefined"
    ? undefined
    : (type) => MediaRecorder.isTypeSupported(type)
): RecordingFormat | null {
  if (!isTypeSupported) return null
  return FORMATS.find((f) => isTypeSupported(f.mimeType)) ?? null
}
