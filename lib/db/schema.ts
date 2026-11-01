import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  profileImage: text("profile_image"),
  systemPrompt: text("system_prompt"),
  favoriteModels: jsonb("favorite_models").$type<string[]>().default([]),
  messageCount: integer("message_count").default(0),
  dailyMessageCount: integer("daily_message_count").default(0),
  dailyReset: timestamp("daily_reset", { withTimezone: true }),
  dailyProMessageCount: integer("daily_pro_message_count").default(0),
  dailyProReset: timestamp("daily_pro_reset", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  // Working directory on the box Hermes clones/edits into for this project.
  // Nullable: a project created before this column, or one that never got a
  // folder, just has no "Folder" rail on its page. See lib/projects/context.ts
  // for how this reaches the model, and app/api/projects/route.ts for the
  // default it gets on create.
  folder: text("folder"),
  // Pinned context every chat in the project inherits. The chat's own prompt
  // still applies on top of it -- this is the part that does not have to be
  // repeated in each new chat.
  systemPrompt: text("system_prompt"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// A file uploaded into a project. Unlike chatAttachments (one chat, shown
// inline), these belong to the project itself and are folded into every
// chat's system prompt via lib/projects/context.ts -- the thing "projects" was
// missing before this table existed. `text` is the extracted content the
// model actually reads; null means the upload was accepted but nothing was
// extracted (a PDF today), not that extraction failed.
export const projectFiles = pgTable("project_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  text: text("text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    model: text("model"),
    systemPrompt: text("system_prompt"),
    public: boolean("public").default(false),
    pinned: boolean("pinned").notNull().default(false),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    // The SSE stream currently in flight for this chat, if any. Set when a reply
    // starts, cleared when it is persisted. A client returning to the chat asks
    // GET /api/chat/[chatId]/stream, which reads this and re-attaches.
    activeStreamId: text("active_stream_id"),
    // The Hermes session that holds this chat's conversation server-side.
    hermesSessionId: text("hermes_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  // A foreign key does not index the column that holds it. The sidebar runs
  // `where user_id = $1 order by pinned, pinned_at, updated_at` on every page
  // load and had nothing to use.
  // DESC to match 0014 and the sidebar's `order by updated_at desc`; the
  // declaration and the migration must agree or drizzle-kit wants to rebuild it.
  (t) => [index("chats_user_id_updated_at_idx").on(t.userId, t.updatedAt.desc())]
)

// The one rolling Hermes session each user talks to; Hermes holds the transcript.
export const userSessions = pgTable("user_sessions", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  hermesSessionId: text("hermes_session_id").notNull(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    role: text("role").notNull(),
    content: text("content"),
    experimentalAttachments: jsonb("experimental_attachments"),
    parts: jsonb("parts"),
    messageGroupId: text("message_group_id"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  // Postgres indexes the key a foreign key POINTS AT, never the column that
  // holds it, so chat_id had no index at all. Composite in query order:
  // equality first, then both sort columns, so one index serves
  // `where chat_id = $1 order by created_at, id` without a sort step.
  (t) => [
    index("messages_chat_id_created_at_id_idx").on(t.chatId, t.createdAt, t.id),
    index("messages_user_id_idx").on(t.userId),
  ]
)

export const userKeys = pgTable(
  "user_keys",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    iv: text("iv").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })]
)

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  layout: text("layout").default("sidebar"),
  promptSuggestions: boolean("prompt_suggestions").default(false),
  showToolInvocations: boolean("show_tool_invocations").default(true),
  showConversationPreviews: boolean("show_conversation_previews").default(
    true
  ),
  multiModelEnabled: boolean("multi_model_enabled").default(false),
  hiddenModels: jsonb("hidden_models").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// A thumbs up / thumbs down on ONE assistant message, which the existing
// `feedback` table above cannot express -- that one is free-text app feedback
// with no message attached.
//
// Keyed on (message_ref, user_id) so a second vote replaces the first instead of
// stacking, and so "what did this user think of this message" is a primary-key
// lookup. rating is -1 or 1; clearing a vote deletes the row rather than
// storing a third state nobody asked for.
export const messageFeedback = pgTable(
  "message_feedback",
  {
    // "12" for a row Zola stored, "h345" for a Hermes transcript row.
    messageRef: text("message_ref").notNull(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.messageRef, table.userId] })]
)

export const canvases = pgTable("canvases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled"),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const chatAttachments = pgTable("chat_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// Passkeys. One row per authenticator a person has enrolled, so a phone and a
// laptop are two rows for the same user and losing one loses nothing.
//
// `id` is the credential ID the authenticator generated, base64url, and it is
// the primary key because that is what the browser hands back at login --
// there is nothing else to look a credential up by before anyone is
// authenticated.
export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(), // base64url COSE key
  // Authenticators that implement it increment this on every assertion; a
  // value that goes backwards means a cloned credential.
  counter: integer("counter").notNull().default(0),
  transports: jsonb("transports").$type<string[]>().default([]),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
})
