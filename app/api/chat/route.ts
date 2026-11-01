import { canvasSystemPromptAddendum } from "@/lib/canvas/prompt"
import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import { projectContext } from "@/lib/projects/context"
import { activeSession, hermesRequest } from "@/lib/hermes/client"
import { hermesSessionStreamToUIMessageStream } from "@/lib/hermes/stream"
import { beginRun, endRun, moveRun } from "@/lib/runs"
import { THINKING_EFFORTS, THINKING_EFFORT_DEFAULT } from "@/lib/thinking-effort"
import { getCurrentUser } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { createUIMessageStreamResponse, type UIMessage } from "ai"
import { and, eq } from "drizzle-orm"
import { incrementMessageCount, validateAndTrackUsage } from "./api"
import { createErrorResponse } from "./utils"

export const maxDuration = 60

type ChatRequest = {
  messages: UIMessage[]
  model: string
  systemPrompt: string
  /** Thinking slider rung; see lib/thinking-effort.ts. Anything unknown
   *  becomes the default rung -- there is no "let the runtime decide". */
  reasoningEffort?: string
  /** Set by the client when a canvas tab is active; triggers the ```canvas protocol addendum below. */
  canvasId?: string
  canvasTitle?: string
}

// The instructions of the user's active project, if one is set, plus the text
// of that project's uploaded files (see lib/projects/context.ts -- this is the
// part that makes "projects" hold files, not just a prompt). One join rather
// than two round trips for the project row itself, and null when no project is
// active.
async function projectPromptFor(userId: string): Promise<string | null> {
  const [row] = await db
    .select({
      projectId: schema.projects.id,
      systemPrompt: schema.projects.systemPrompt,
    })
    .from(schema.userSessions)
    .innerJoin(
      schema.projects,
      eq(schema.userSessions.projectId, schema.projects.id)
    )
    .where(and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.isActive, true)))
  if (!row) return null

  const instructions = row.systemPrompt?.trim() || ""
  const filesBlock = await projectContext(row.projectId)
  const combined = `${instructions}${filesBlock}`.trim()
  return combined || null
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      })
    }
    const userId = user.id

    const { messages, model, systemPrompt, reasoningEffort, canvasId, canvasTitle } =
      (await req.json()) as ChatRequest

    // The picker's rungs are Hermes' own vocabulary (see
    // thinking-effort-select.tsx), forwarded unchanged.
    //
    // There is no "auto" and no path that sends no override at all: omitting
    // the field made identical requests think for different lengths with
    // nothing in the UI to say why. An unknown or missing value -- an older
    // client, a stale stored preference, the literal string "auto" -- resolves
    // to the default rung instead of disappearing.
    const effort = THINKING_EFFORTS.includes(reasoningEffort ?? "")
      ? (reasoningEffort as string)
      : THINKING_EFFORT_DEFAULT

    if (!messages?.length) {
      return new Response(
        JSON.stringify({ error: "Error, missing information" }),
        { status: 400 }
      )
    }

    await validateAndTrackUsage({ userId })
    await incrementMessageCount({ userId })

    const userMessage = messages[messages.length - 1]

    // The active project's instructions apply to every turn. Resolved here
    // rather than in the client: a client that forgets to send them is not a
    // reason for a turn to run without them.
    const projectInstructions = await projectPromptFor(userId)

    // Canvas protocol is always on so a first "write me a doc" request can
    // open a canvas; the title hint is added only while one is open.
    // user.systemPrompt before the built-in default, for the same reason the
    // project instructions above are resolved here: the promise is that the
    // user's own prompt applies, and a client that forgets to send it is not a
    // reason for the turn to run as stock Zola.
    const effectiveSystemPrompt = `${projectInstructions ? `${projectInstructions}\n\n` : ""}${systemPrompt || user.systemPrompt?.trim() || SYSTEM_PROMPT_DEFAULT}

${canvasSystemPromptAddendum(canvasId ? canvasTitle : undefined)}`

    // Everything from here on is the turn itself, and it is interruptible.
    // `beginRun` queues behind whatever is still running for this session:
    // two turns on one Hermes session is what wedged it and left it unable to
    // answer anything at all.
    const { profile, sessionId: firstSessionId } = await activeSession(user)
    let sessionId = firstSessionId
    const run = await beginRun(sessionId)
    if (req.signal.aborted) {
      // The client left while queued; do not start a turn nobody will read.
      endRun(sessionId, run)
      return new Response(null, { status: 499 })
    }

    // The session holds the conversation, so only the newest message is sent.
    const send = () =>
      hermesRequest({
        message: userMessage,
        model,
        user,
        profile,
        sessionId,
        systemPrompt: effectiveSystemPrompt,
        reasoningEffort: effort,
        // What makes Stop mean stop: aborting this cancels the request to
        // Hermes, which ends the SSE below.
        signal: run.controller.signal,
      })
    // Hermes can hold the session lease for a moment after the previous
    // stream ends and answers 409 until it is released.
    let hermesRes: Response
    let replaced = false
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const sent = await send()
          hermesRes = sent.res
          replaced = sent.replaced
          if (sent.sessionId !== sessionId) {
            // The old session was gone; the run now lives under the new id.
            moveRun(sessionId, sent.sessionId, run)
            sessionId = sent.sessionId
          }
          break
        } catch (err) {
          if (attempt >= 3 || !String(err).includes("failed (409)")) throw err
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    } catch (err) {
      endRun(sessionId, run)
      throw err
    }

    const stream = hermesSessionStreamToUIMessageStream(
      hermesRes.body as ReadableStream<Uint8Array>
    )

    // Every chunk is recorded on the run before it is sent anywhere. This sits
    // upstream of the tee, so recording follows the drained branch and goes on
    // after the browser disconnects; a reattaching client replays from it.
    let noticed = !replaced
    return createUIMessageStreamResponse({
      stream: stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            run.publish(chunk)
            controller.enqueue(chunk)
            // The Hermes session was gone, so the earlier transcript is lost;
            // say so right after the stream's opening chunk.
            if (!noticed) {
              noticed = true
              const notice = {
                type: "data-notice" as const,
                data: {
                  text: "The previous conversation was no longer available, so this one starts fresh.",
                },
              }
              run.publish(notice)
              controller.enqueue(notice)
            }
          },
          flush() {
            endRun(sessionId, run)
          },
        })
      ),
      consumeSseStream: ({ stream }) =>
        stream.pipeTo(new WritableStream()).catch(() => {}),
    })
  } catch (err: unknown) {
    console.error("Error in /api/chat:", err)
    const error = err as {
      code?: string
      message?: string
      statusCode?: number
    }

    return createErrorResponse(error)
  }
}
