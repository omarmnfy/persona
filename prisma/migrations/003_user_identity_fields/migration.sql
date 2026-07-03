-- Add user identity fields for student onboarding and in-room pseudonyms
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "school" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fixedRole" "Role";

CREATE UNIQUE INDEX IF NOT EXISTS "User_assignedName_key" ON "User"("assignedName");
