/**
 * Drop a text part that repeats the one immediately before it.
 *
 * Hermes' `assistant.completed` carries the last segment of a reply as well as
 * the streamed deltas that already produced it, and for a while both were kept
 * as separate text parts -- so an affected message renders its answer twice,
 * and its stored row keeps doing so forever. The server no longer writes the
 * pair (lib/hermes/stream.ts), but rows written before that fix are history and
 * must still read as one answer.
 *
 * Only two ADJACENT text parts that are equal once trimmed collapse, and the
 * first is kept, so a message that legitimately repeats a line is untouched.
 */
export function collapseRepeatedText<T extends { type: string; text?: string }>(
  parts: T[]
): T[] {
  const out: T[] = []
  for (const part of parts) {
    const previous = out[out.length - 1]
    if (
      part.type === "text" &&
      previous?.type === "text" &&
      (part.text ?? "").trim() === (previous.text ?? "").trim()
    ) {
      continue
    }
    out.push(part)
  }
  return out
}
