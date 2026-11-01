import assert from "node:assert"
import { matchCommands, parseSlash, SLASH_COMMANDS } from "./slash-commands"

/**
 * The only tricky part of slash commands is deciding what IS one. Get that
 * wrong in the permissive direction and an ordinary message containing a slash
 * pops a menu over the composer; get it wrong the other way and the feature
 * never appears.
 */
function main() {
  // --- not commands ---------------------------------------------------------
  assert.equal(parseSlash(""), null)
  assert.equal(parseSlash("hello"), null, "plain text")
  assert.equal(parseSlash("what is 10/4"), null, "slash mid-message")
  assert.equal(parseSlash("see http://x/y"), null, "slash in a url")

  // --- a bare slash offers everything --------------------------------------
  const bare = parseSlash("/")
  assert.deepEqual(bare, { typed: "", rest: "" })
  assert.equal(matchCommands("").length, SLASH_COMMANDS.length)

  // --- partial names filter -------------------------------------------------
  assert.deepEqual(parseSlash("/sum"), { typed: "sum", rest: "" })
  assert.deepEqual(
    matchCommands("sum").map((c) => c.name),
    ["summarize"]
  )
  assert.equal(matchCommands("zzz").length, 0, "no match closes the menu")

  // --- a command with an argument keeps the argument ------------------------
  assert.deepEqual(parseSlash("/summarize these notes"), {
    typed: "summarize",
    rest: "these notes",
  })

  // A multi-line argument: only the FIRST line decides whether this is a
  // command, but the whole body has to survive as `rest` or pasting several
  // paragraphs after /summarize would silently drop all but the first.
  const multi = parseSlash("/summarize line one\nline two")
  assert.equal(multi?.typed, "summarize")
  assert.ok(
    multi?.rest.includes("line two"),
    "the argument must keep every line, not just the first"
  )

  // --- the registry itself --------------------------------------------------
  const names = SLASH_COMMANDS.map((c) => c.name)
  assert.equal(new Set(names).size, names.length, "duplicate command name")
  for (const c of SLASH_COMMANDS) {
    assert.ok(/^[a-z]+$/.test(c.name), `${c.name}: names must match the parser`)
    assert.ok(c.hint.length > 0, `${c.name}: needs a hint`)
  }

  // --- a template command rewrites the composer -----------------------------
  const summarize = SLASH_COMMANDS.find((c) => c.name === "summarize")!
  let written: string | null = null
  summarize.run({
    setValue: (v) => {
      written = v
    },
    rest: "the quarterly numbers",
    newChat: () => assert.fail("summarize must not navigate"),
    send: () => assert.fail("summarize must not send"),
  })
  assert.ok(
    written !== null && String(written).includes("the quarterly numbers"),
    "the template must carry the argument through"
  )

  console.log("slash-commands: ok")
}

main()
