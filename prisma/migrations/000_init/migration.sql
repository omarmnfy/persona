-- Initial schema for Persona

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "AccountType" AS ENUM ('STUDENT', 'ADMIN');
CREATE TYPE "RoundStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'ENDED');
CREATE TYPE "RoomStatus" AS ENUM ('NOT_STARTED', 'ACTIVE', 'ENDED');
CREATE TYPE "Role" AS ENUM ('REAL', 'FAKE', 'INTERROGATOR', 'WAITING');
CREATE TYPE "MessageType" AS ENUM ('USER', 'SYSTEM');

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "accountType" "AccountType" NOT NULL,
  "realName" TEXT NOT NULL,
  "nickname" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastSeenAt" TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "Session" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "csrfToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "ClassConfig" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "joinCodeHash" TEXT,
  "joinCodeCreatedAt" TIMESTAMP,
  "allowAdminPosting" BOOLEAN NOT NULL DEFAULT FALSE,
  "showAdminJoinMessage" BOOLEAN NOT NULL DEFAULT TRUE,
  "silentViewReadOnly" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "InviteToken" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenHash" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "usedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "InviteToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "Round" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "roundNumber" INTEGER NOT NULL,
  "topic" TEXT NOT NULL,
  "status" "RoundStatus" NOT NULL,
  "seed" TEXT,
  "durationSeconds" INTEGER NOT NULL,
  "autoReshuffle" BOOLEAN NOT NULL DEFAULT FALSE,
  "assignmentsLocked" BOOLEAN NOT NULL DEFAULT FALSE,
  "startsAt" TIMESTAMP,
  "endsAt" TIMESTAMP,
  "createdByAdminId" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Round_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id")
);

CREATE UNIQUE INDEX "Round_roundNumber_key" ON "Round"("roundNumber");

CREATE TABLE "Room" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "roundId" UUID NOT NULL,
  "roomNumber" INTEGER NOT NULL,
  "status" "RoomStatus" NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Room_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "Room_roundId_roomNumber_key" ON "Room"("roundId", "roomNumber");

CREATE TABLE "RoomMembership" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "roundId" UUID NOT NULL,
  "roomId" UUID,
  "userId" UUID NOT NULL,
  "assignedRole" "Role" NOT NULL,
  "nicknameUsed" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "joinedAt" TIMESTAMP,
  "leftAt" TIMESTAMP,
  CONSTRAINT "RoomMembership_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE,
  CONSTRAINT "RoomMembership_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE,
  CONSTRAINT "RoomMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "RoomMembership_roundId_userId_key" ON "RoomMembership"("roundId", "userId");
CREATE INDEX "RoomMembership_roomId_idx" ON "RoomMembership"("roomId");

CREATE TABLE "Message" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "roundId" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "senderId" UUID,
  "recipientId" UUID,
  "body" TEXT NOT NULL,
  "type" "MessageType" NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Message_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE,
  CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE,
  CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id"),
  CONSTRAINT "Message_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id")
);

CREATE INDEX "Message_roomId_idx" ON "Message"("roomId");

CREATE TABLE "AuditLog" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "adminId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "payloadJSON" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id")
);
