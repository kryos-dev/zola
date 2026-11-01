/**
 * The slash-command registry.
 *
 * Owner: "slash commands, missing, like chatgpt i want".
 *
 * Deliberately a plain array so adding a command is one entry rather than a new
 * component, and deliberately limited to things that ALREADY work — a slash
 * command is a keyboard route to an existing action, not a place to hide new
 * backend work. Everything here maps to a control that is already on screen or
 * to a prompt the model already handles.
 */

export type SlashContext = {
  /** Replace the composer contents. */
  setValue: (value: string) => void
  /** Current composer contents, minus the command itself. */
  rest: string
  setReasoningEffort?: (effort: string) => void
  /** Navigate to a fresh chat. */
  newChat: () => void
  /** Submit the composer as it stands. */
  send: () => void
}

export type SlashCommand = {
  name: string
  hint: string
  run: (ctx: SlashContext) => void
}

/** Prompt shortcuts: the command becomes a framing around whatever follows it. */
function template(name: string, hint: string, build: (rest: string) => string): SlashCommand {
  return {
    name,
    hint,
    run: ({ setValue, rest }) => setValue(build(rest)),
  }
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "think",
    hint: "Ask for more reasoning effort on the next turn",
    run: ({ setReasoningEffort, setValue, rest }) => {
      setReasoningEffort?.("high")
      setValue(rest)
    },
  },
  {
    name: "task",
    hint: "Run the job in the background as a task",
    // Without a job it only fills in the prefix; with one the composer
    // (/task <job>) is submitted and chat-view starts the task.
    run: ({ setValue, rest, send }) => (rest ? send() : setValue("/task ")),
  },
  {
    name: "new",
    hint: "Start a new chat",
    run: ({ newChat }) => newChat(),
  },
  {
    name: "clear",
    hint: "Empty the composer",
    run: ({ setValue }) => setValue(""),
  },
  template(
    "summarize",
    "Summarise the text that follows",
    (rest) =>
      `Summarise the following. Lead with the single most important point, then the rest in order of importance. No preamble.\n\n${rest}`
  ),
  template(
    "explain",
    "Explain the thing that follows, plainly",
    (rest) =>
      `Explain the following plainly, assuming I am technical but new to this specific thing. Say what it is, why it exists, and the one part people get wrong.\n\n${rest}`
  ),
  template(
    "improve",
    "Rewrite the text that follows",
    (rest) =>
      `Rewrite the following to be clearer and shorter without losing meaning. Show only the rewrite, then one line on what you changed.\n\n${rest}`
  ),
]

/**
 * Parse a composer value as a slash command in progress.
 *
 * Returns null unless the value starts with `/` on the FIRST line and the
 * command word itself is still unbroken — so `/sum` is a command being typed,
 * `/summarize these notes` is a command with an argument, and a message that
 * merely contains a slash is not touched.
 */
export function parseSlash(
  value: string
): { typed: string; rest: string } | null {
  if (!value.startsWith("/")) return null
  // Matched against the WHOLE value, not just the first line. An earlier
  // version parsed only the first line once the value was multi-line, which
  // silently dropped every paragraph after the first out of `rest` — so
  // pasting three paragraphs under /summarize summarised one of them.
  //
  // `[a-zA-Z]*` then a required space is also what keeps "/usr/bin/env" from
  // being read as a command: the character after the word is a slash, not
  // whitespace or end-of-string, so this returns null.
  const match = /^\/([a-zA-Z]*)(?:\s+([\s\S]*))?$/.exec(value)
  if (!match) return null
  return { typed: match[1] ?? "", rest: (match[2] ?? "").trim() }
}

export function matchCommands(typed: string): SlashCommand[] {
  const q = typed.toLowerCase()
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q))
}
