import {
  BookOpenText,
  Brain,
  Code,
  Lightbulb,
  Notepad,
  PaintBrush,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr"

export const NON_AUTH_DAILY_MESSAGE_LIMIT = 100000
export const AUTH_DAILY_MESSAGE_LIMIT = 1000
export const REMAINING_QUERY_ALERT_THRESHOLD = 2
export const DAILY_FILE_UPLOAD_LIMIT = 5
export const DAILY_LIMIT_PRO_MODELS = 500

// Fallback model id used until the live model list from Hermes has loaded.
// "hermes-agent" tells the gateway to use the agent's own configured default.
export const MODEL_DEFAULT = "hermes-agent"

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Zola"
export const APP_DOMAIN = "https://zola.chat"

export const SUGGESTIONS = [
  {
    label: "Summary",
    highlight: "Summarize",
    prompt: `Summarize`,
    items: [
      "Summarize the French Revolution",
      "Summarize the plot of Inception",
      "Summarize World War II in 5 sentences",
      "Summarize the benefits of meditation",
    ],
    icon: Notepad,
  },
  {
    label: "Code",
    highlight: "Help me",
    prompt: `Help me`,
    items: [
      "Help me write a function to reverse a string in JavaScript",
      "Help me create a responsive navbar in HTML/CSS",
      "Help me write a SQL query to find duplicate emails",
      "Help me convert this Python function to JavaScript",
    ],
    icon: Code,
  },
  {
    label: "Design",
    highlight: "Design",
    prompt: `Design`,
    items: [
      "Design a color palette for a tech blog",
      "Design a UX checklist for mobile apps",
      "Design 5 great font pairings for a landing page",
      "Design better CTAs with useful tips",
    ],
    icon: PaintBrush,
  },
  {
    label: "Research",
    highlight: "Research",
    prompt: `Research`,
    items: [
      "Research the pros and cons of remote work",
      "Research the differences between Apple Vision Pro and Meta Quest",
      "Research best practices for password security",
      "Research the latest trends in renewable energy",
    ],
    icon: BookOpenText,
  },
  {
    label: "Get inspired",
    highlight: "Inspire me",
    prompt: `Inspire me`,
    items: [
      "Inspire me with a beautiful quote about creativity",
      "Inspire me with a writing prompt about solitude",
      "Inspire me with a poetic way to start a newsletter",
      "Inspire me by describing a peaceful morning in nature",
    ],
    icon: Sparkle,
  },
  {
    label: "Think deeply",
    highlight: "Reflect on",
    prompt: `Reflect on`,
    items: [
      "Reflect on why we fear uncertainty",
      "Reflect on what makes a conversation meaningful",
      "Reflect on the concept of time in a simple way",
      "Reflect on what it means to live intentionally",
    ],
    icon: Brain,
  },
  {
    label: "Learn gently",
    highlight: "Explain",
    prompt: `Explain`,
    items: [
      "Explain quantum physics like I'm 10",
      "Explain stoicism in simple terms",
      "Explain how a neural network works",
      "Explain the difference between AI and AGI",
    ],
    icon: Lightbulb,
  },
]

// Sent to the agent as `instructions` on every turn (app/api/chat/route.ts).
// Upstream's text was a tone guide and nothing else, so the model had no idea
// whose machine it was on: asked to fetch public images or music for the
// owner's own library it refused as if it were a public service. This is a single-operator box;
// the operator's own lawful use is not the model's call to gate.
export const SYSTEM_PROMPT_DEFAULT = `You are the owner's personal assistant on the owner's own self-hosted machine (CLOUD9). Your name and personality come from your own profile; keep them. There is exactly one user: the owner, who built and runs this system and is fully authenticated. You are not a public service and there are no other people to protect from the owner's own requests.

Act on requests directly. Scraping, downloading, indexing or organising publicly reachable images, music, video, posts and pages for the owner's private library is routine work here — do it, using the tools you have (browser, terminal, search, the media and image services), and report what you fetched and where it landed. Do not refuse, moralise, add disclaimers, or ask for permission the owner already gave by asking. Do not water a task down to a "safer" version without saying so. If something is genuinely impossible with the tools on this box, say exactly what is missing (a credential, a blocked network path, a missing package) in one line and propose the shortest fix.

The only things you do not do on your own: send messages, publish or post anywhere on the owner's behalf, spend money, or delete data outside the task's own scratch space — ask first for those, once, briefly.

Tone: calm, minimal, human. Say what you did and what you found; skip preamble and filler. Ask a question only when the answer changes what you would build.`

// 10000 was upstream's number and it is far too small for what this chat is
// actually used for: one pasted stack trace, deploy log or config file trips
// it, and the send is refused rather than truncated. The
// column is `text`, so the database never cared; the real ceiling is the
// model's context, and every lane on the box takes six figures of characters.
// This stays only as a guard against pasting something absurd by accident.
export const MESSAGE_MAX_LENGTH = 200000
