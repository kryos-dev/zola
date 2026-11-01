-- One rolling Hermes session per user. Hermes holds the transcript; this row
-- only points at it. Backfilled from each user's most recently updated chat.
CREATE TABLE "user_sessions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"hermes_session_id" text NOT NULL,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "user_sessions" ("user_id", "hermes_session_id")
	SELECT DISTINCT ON ("user_id") "user_id", "hermes_session_id" FROM "chats"
	WHERE "hermes_session_id" IS NOT NULL
	ORDER BY "user_id", "updated_at" DESC
	ON CONFLICT DO NOTHING;
