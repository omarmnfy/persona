-- Add round join code and expected students fields
ALTER TABLE "Round" ADD COLUMN "expectedStudents" INTEGER;
ALTER TABLE "Round" ADD COLUMN "joinCodeHash" TEXT;
ALTER TABLE "Round" ADD COLUMN "joinCodeCreatedAt" TIMESTAMP;
