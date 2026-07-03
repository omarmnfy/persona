-- Add interrogator question/answer timing metadata to messages
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "questionId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "isQuestion" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "revealAt" TIMESTAMP;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "questionEndsAt" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Message_roomId_questionId_idx" ON "Message"("roomId", "questionId");
CREATE INDEX IF NOT EXISTS "Message_revealAt_idx" ON "Message"("revealAt");
