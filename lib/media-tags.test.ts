// node --import tsx lib/media-tags.test.ts
//
// The awkward captures here are the ones the desktop client's
// parts.test.ts / parts.capture.test.ts already pin down, so the two surfaces
// cannot disagree about what a MEDIA: tag means.
import assert from "node:assert/strict"
import test from "node:test"
import {
  isServableMediaPath,
  mediaKind,
  mediaName,
  mediaSrcUrl,
  splitMediaSegments,
} from "./media-tags"

/** The media paths in a string, i.e. what would be rendered as a file. */
const paths = (text: string) =>
  splitMediaSegments(text)
    .filter((s): s is { kind: "media"; path: string } => s.kind === "media")
    .map((s) => s.path)

/** The prose in a string, with media tags removed. */
const prose = (text: string) =>
  splitMediaSegments(text)
    .filter((s): s is { kind: "text"; text: string } => s.kind === "text")
    .map((s) => s.text)
    .join("")

test("an unquoted path with interior spaces stays one path", () => {
  const spaced = "/home/ubuntu/.hermes/cache/AI Brain/report.pdf"
  assert.deepEqual(paths(`MEDIA:${spaced}`), [spaced])
  assert.deepEqual(paths(`Here you go: MEDIA:${spaced} — enjoy`), [spaced])
})

test("the tag is removed from the prose it sat in", () => {
  assert.equal(prose("Here you go:\nMEDIA:/tmp/a.png\nenjoy"), "Here you go:\n\nenjoy")
})

test("trailing sentence punctuation belongs to the sentence", () => {
  assert.deepEqual(paths("open MEDIA:/tmp/a.pdf."), ["/tmp/a.pdf"])
  assert.equal(prose("open MEDIA:/tmp/a.pdf."), "open .")
  assert.deepEqual(paths("MEDIA:/tmp/report.pdf!"), ["/tmp/report.pdf"])
})

test("quotes are the escape hatch, so their contents are kept whole", () => {
  assert.deepEqual(paths("MEDIA:'/tmp/stop!.md'"), ["/tmp/stop!.md"])
  assert.deepEqual(paths('MEDIA:"/tmp/a b.md."'), ["/tmp/a b.md."])
})

test("a capture that names nothing stays prose", () => {
  assert.deepEqual(paths("MEDIA:..."), [])
  assert.deepEqual(paths("MEDIA:download"), [])
  assert.deepEqual(paths("MEDIA:'"), [])
  assert.equal(prose("MEDIA:..."), "MEDIA:...")
  assert.equal(prose("MEDIA:download"), "MEDIA:download")
})

test("a relative path is still a file, named as written", () => {
  assert.deepEqual(paths("MEDIA:report.md prose"), ["report.md"])
})

test("a tag inside a fenced code block is an example, not a file", () => {
  const text = ["For example:", "```", "MEDIA:/tmp/example.png", "```"].join("\n")
  assert.deepEqual(paths(text), [])
  assert.equal(splitMediaSegments(text).length, 1)
})

test("an ordinary answer with one image yields prose, file, prose", () => {
  const text = "Here it is.\n\nMEDIA:/home/ubuntu/shot.png\n\nLooks right."
  const segments = splitMediaSegments(text)
  assert.deepEqual(
    segments.map((s) => s.kind),
    ["text", "media", "text"]
  )
  assert.deepEqual(paths(text), ["/home/ubuntu/shot.png"])
})

test("text with no tag is returned as a single prose segment", () => {
  const segments = splitMediaSegments("nothing to see")
  assert.deepEqual(segments, [{ kind: "text", text: "nothing to see" }])
})

test("the file kind comes from the extension", () => {
  assert.equal(mediaKind("/tmp/a.png"), "image")
  assert.equal(mediaKind("/tmp/a.PNG"), "image")
  assert.equal(mediaKind("/tmp/a.mp4"), "video")
  assert.equal(mediaKind("/tmp/a.mp3"), "audio")
  assert.equal(mediaKind("/tmp/a.pdf"), "file")
  assert.equal(mediaKind("/tmp/no-extension"), "file")
})

test("the name is the last path component", () => {
  assert.equal(mediaName("/home/ubuntu/shot.png"), "shot.png")
  assert.equal(mediaName("C:\\Users\\me\\a b.png"), "a b.png")
})

test("only an absolute path can be fetched from the host", () => {
  assert.equal(isServableMediaPath("/home/ubuntu/a.png"), true)
  assert.equal(isServableMediaPath("~/.hermes/a.png"), true)
  assert.equal(isServableMediaPath("report.md"), false)
  assert.equal(mediaSrcUrl("/tmp/a b.png"), "/api/media?path=%2Ftmp%2Fa%20b.png")
})
