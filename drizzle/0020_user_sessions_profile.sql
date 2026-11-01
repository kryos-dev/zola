-- One rolling Hermes session per user and persona (Hermes profile). The row
-- flagged is_active is the persona the user is talking to; existing rows are
-- the default profile and stay active.
ALTER TABLE "user_sessions" DROP CONSTRAINT "user_sessions_pkey";
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "profile" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "user_sessions" SET "is_active" = true;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_profile_pk" PRIMARY KEY ("user_id","profile");
