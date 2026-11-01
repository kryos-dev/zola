-- Canvases belong to the person, not a chat, so they survive starting a new
-- conversation.
ALTER TABLE "canvases" ADD COLUMN "user_id" uuid;
--> statement-breakpoint
UPDATE "canvases" c SET "user_id" = ch."user_id" FROM "chats" ch WHERE ch."id" = c."chat_id";
--> statement-breakpoint
ALTER TABLE "canvases" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canvases" DROP COLUMN "chat_id";
