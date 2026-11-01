// Voice mode speaks a reply while it is still streaming. takeSpeech() cuts the
// text that has arrived so far into speakable chunks: whole sentences of at
// least MIN characters, with markdown, emoji and code blocks removed. The text
// after the last chunk stays unconsumed (`next`) until more arrives; `final`
// flushes whatever is left.

const MIN = 20

/** Plain speakable text from one piece of markdown. */
export function speakable(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~|#>]+/g, " ")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function takeSpeech(
  text: string,
  from: number,
  final: boolean,
  min = MIN
): { chunks: string[]; next: number } {
  let rest = text.slice(from)
  // An unclosed code fence is still being written: hold it (or drop it at the end).
  const fences = rest.split("```").length - 1
  const held = fences % 2 ? rest.length - rest.lastIndexOf("```") : 0
  if (held) rest = rest.slice(0, rest.length - held)

  const chunks: string[] = []
  let pending = ""
  let consumed = 0
  let pos = 0
  for (const [i, seg] of rest.split(/(```[\s\S]*?```)/).entries()) {
    if (i % 2) {
      pos += seg.length
      if (!pending) consumed = pos
      continue
    }
    let end = 0
    for (const m of seg.matchAll(/[\s\S]*?(?:[.!?।]+(?=\s)|\n+)/g)) {
      end = m.index + m[0].length
      const clean = speakable(m[0])
      if (clean) pending = pending ? `${pending} ${clean}` : clean
      if (pending.length >= min) {
        chunks.push(pending)
        pending = ""
      }
      if (!pending) consumed = pos + end
    }
    pos += seg.length
    if (final) {
      const tail = speakable(seg.slice(end))
      if (tail) pending = pending ? `${pending} ${tail}` : tail
    }
  }
  if (final) {
    if (pending) chunks.push(pending)
    return { chunks, next: text.length }
  }
  return { chunks, next: from + consumed }
}
