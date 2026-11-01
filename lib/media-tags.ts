// MEDIA: delivery tags -- one parser for both the desktop client and this app.
//
// Ported from the Hermes desktop client (`lib/chat-messages/parts.ts` and
// `lib/media.ts`, covered there by parts.test.ts / parts.capture.test.ts).
// Keeping its rules means a path Zola delivers renders here the way it does in
// the desktop app: an unquoted path may contain spaces and is only believed
// when it ends in a known deliverable extension; quotes are the escape hatch
// for odd names; trailing sentence punctuation belongs to the prose, not the
// path; a capture that names nothing (`MEDIA:...`) stays prose.
//
// Zola's own reading of the tag is narrower than the desktop's: the desktop
// turns it into a `#media:` markdown link, this app renders the file inline.

/**
 * Known deliverable extensions -- mirrors `MEDIA_DELIVERY_EXTS` in the Hermes
 * gateway (`gateway/platforms/base.py`) so the two surfaces agree on which
 * `MEDIA:` paths are valid. Used to anchor the end of an unquoted path that may
 * contain interior spaces.
 */
export const MEDIA_DELIVERY_EXTS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "svg",
  "mp4", "mov", "avi", "mkv", "webm", "3gp",
  "mp3", "m2a", "wav", "ogg", "opus", "m4a", "flac",
  "pdf", "docx", "doc", "odt", "rtf", "txt", "md", "epub",
  "xlsx", "xls", "ods", "csv", "tsv",
  "json", "xml", "yaml", "yml",
  "kmz", "kml", "geojson", "gpx",
  "pptx", "ppt", "odp", "key",
  "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar",
  "apk", "ipa", "html", "htm",
] as const

// Longest-first so the alternation never matches a shorter extension as the
// prefix of a longer one (`tar` before `tar.gz`).
const EXT_ALTERNATION = [...MEDIA_DELIVERY_EXTS]
  .sort((a, b) => b.length - a.length)
  .join("|")

// Unquoted path: starts at a path anchor (`~/`, `/`, `X:\`, `X:/`), may contain
// interior whitespace, and must end on a known deliverable extension.
const PATH_ANCHORED =
  "(?:~/|/|[A-Za-z]:[/\\\\])\\S+?(?:[^\\S\\n]+\\S+?)*?\\.(?:" +
  EXT_ALTERNATION +
  ")(?=[\\s`\"'*_,;:)\\]}]|MEDIA:|$)"

// Bare-word fallback for paths the anchored branch misses (relative paths,
// unknown extensions). Stops before a backtick or double quote so an
// inline-code closer is not swallowed; apostrophes stay legal in the path.
const PATH_BARE = "[^\\s`\"]+"

const QUOTES = ["\"", "'", "`"]
const TRAILING_PUNCTUATION = ".,;:!?"

const MEDIA_TAG_RE = new RegExp(
  "[`\"']?MEDIA:\\s*(?<inline>`[^`\\n]+`|\"[^\"\\n]+\"|'[^'\\n]+'|" +
    PATH_ANCHORED +
    "|" +
    PATH_BARE +
    ")[`\"']?",
  "g"
)

/**
 * Whether a capture can name a real deliverable: a path separator, or a dot
 * with file content after it (`report.md`, `.env`, `../a.png`). Anything else
 * (`...`, a lone quote, a bare English word) stays prose.
 */
export function isPlausibleMediaPath(value: string): boolean {
  return value.includes("/") || value.includes("\\") || /\.[^.]/.test(value)
}

function unquoteMediaPath(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed[0]

  if (quote && quote === trimmed.at(-1) && QUOTES.includes(quote)) {
    return trimmed.slice(1, -1)
  }

  // A trailing backtick or double quote left in the value is formatting
  // residue, not part of the path. Apostrophes are not residue (`john's.md`).
  const last = trimmed.at(-1)
  return last === "`" || last === "\"" ? trimmed.slice(0, -1) : trimmed
}

/**
 * Split a bare capture into its path and the sentence punctuation that trailed
 * it in prose: `open MEDIA:/tmp/a.pdf.` captured `/tmp/a.pdf.` and the period
 * belongs to the sentence. Punctuation is only prose while what precedes it
 * still names a path, so `MEDIA:...` is never split into a degenerate capture.
 */
function splitTrailingPunctuation(value: string): {
  path: string
  punctuation: string
} {
  let end = value.length
  while (end > 0 && TRAILING_PUNCTUATION.includes(value[end - 1] ?? "")) {
    if (!isPlausibleMediaPath(value.slice(0, end - 1))) break
    end -= 1
  }
  return { path: value.slice(0, end), punctuation: value.slice(end) }
}

/** The path a raw capture names, plus punctuation to hand back to the prose. */
function resolveMediaValue(
  raw: string
): { path: string; punctuation: string } | null {
  const trimmed = raw.trim()
  const quote = trimmed[0]
  const quoted = Boolean(quote) && quote === trimmed.at(-1) && QUOTES.includes(quote)

  const resolved = quoted
    ? { path: unquoteMediaPath(trimmed), punctuation: "" }
    : splitTrailingPunctuation(unquoteMediaPath(trimmed))

  return isPlausibleMediaPath(resolved.path) ? resolved : null
}

/**
 * Byte ranges occupied by fenced code blocks. A `MEDIA:` line inside a fence is
 * an example the answer is quoting, not a file to render -- and splicing it out
 * would leave the fence unbalanced.
 */
function fencedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = []
  let open: number | null = null
  for (const match of text.matchAll(/^[ \t]*(?:```|~~~)[^\n]*$/gm)) {
    const at = match.index ?? 0
    if (open === null) open = at
    else {
      ranges.push([open, at + match[0].length])
      open = null
    }
  }
  if (open !== null) ranges.push([open, text.length])
  return ranges
}

export type MediaSegment =
  | { kind: "text"; text: string }
  | { kind: "media"; path: string }

/** Split assistant text into prose and the `MEDIA:` files it delivers. */
export function splitMediaSegments(text: string): MediaSegment[] {
  if (!text.includes("MEDIA:")) return [{ kind: "text", text }]

  const fences = fencedRanges(text)
  const inFence = (at: number) => fences.some(([from, to]) => at >= from && at < to)

  const segments: MediaSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(MEDIA_TAG_RE)) {
    const start = match.index ?? 0
    if (inFence(start)) continue
    const resolved = resolveMediaValue(match[1] ?? "")
    if (!resolved) continue

    if (start > cursor) segments.push({ kind: "text", text: text.slice(cursor, start) })
    segments.push({ kind: "media", path: resolved.path })
    if (resolved.punctuation) {
      segments.push({ kind: "text", text: resolved.punctuation })
    }
    cursor = start + match[0].length
  }

  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) })
  return segments
}

export type MediaKind = "audio" | "image" | "video" | "file"

const KIND_BY_EXT: Record<string, MediaKind> = {
  avi: "video", mkv: "video", mov: "video", mp4: "video", webm: "video", "3gp": "video",
  bmp: "image", gif: "image", jpeg: "image", jpg: "image", png: "image",
  svg: "image", tiff: "image", webp: "image",
  flac: "audio", m2a: "audio", m4a: "audio", mp3: "audio", ogg: "audio",
  opus: "audio", wav: "audio",
}

function extensionOf(path: string): string {
  return path.split(/[?#]/, 1)[0]?.split(".").pop()?.toLowerCase() ?? ""
}

export function mediaKind(path: string): MediaKind {
  return KIND_BY_EXT[extensionOf(path)] ?? "file"
}

/** The last path component, for a caption or an alt attribute. */
export function mediaName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

/**
 * Whether the Hermes host can read the path as written. A relative path has no
 * meaning without the session's cwd, which this app does not have, so it is
 * shown as a name rather than fetched.
 */
export function isServableMediaPath(path: string): boolean {
  return /^(?:\/|~\/|[A-Za-z]:[\\/])/.test(path)
}

/** The this-app url that streams the file through the Hermes dashboard. */
export function mediaSrcUrl(path: string): string {
  return `/api/media?path=${encodeURIComponent(path)}`
}
