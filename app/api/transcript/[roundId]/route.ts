import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

function formatDisplayName(user: { assignedName?: string | null; nickname?: string | null; realName?: string | null }) {
  return user.assignedName ?? user.nickname ?? user.realName ?? "Unknown";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ roundId: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const userAccountType = session.user.accountType;
  const { roundId } = await params;
  const isAdmin = userAccountType === "ADMIN" || userAccountType === "SUPER_ADMIN";

  const membership = await prisma.roomMembership.findUnique({
    where: { roundId_userId: { roundId, userId } },
    include: {
      room: true,
      round: { select: { topic: true, roundNumber: true, status: true } },
    },
  });

  if (!isAdmin && (!membership || !membership.roomId)) {
    return NextResponse.json({ error: "You were not assigned to a room in this round" }, { status: 404 });
  }

  const round = membership?.round ?? await prisma.round.findUnique({
    where: { id: roundId },
    select: { topic: true, roundNumber: true, status: true },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (round.status !== "ENDED") {
    return NextResponse.json({ error: "Transcript is only available after the round ends" }, { status: 403 });
  }

  const roomId = membership?.roomId;
  if (!roomId) {
    return NextResponse.json({ error: "No room assignment found" }, { status: 404 });
  }

  const allMessages = await prisma.message.findMany({
    where: { roomId },
    include: { sender: true, recipient: true },
    orderBy: { createdAt: "asc" },
  });

  const ROLE_LABELS: Record<string, string> = {
    REAL: "True Collegian",
    FAKE: "Poser",
    INTERROGATOR: "Interrogator",
    WAITING: "Waiting",
  };

  const filteredMessages = isAdmin
    ? allMessages
    : allMessages.filter((msg) => {
        if (msg.recipientId === null) return true;
        if (msg.senderId === userId) return true;
        if (msg.recipientId === userId) return true;
        return false;
      });

  const messages = filteredMessages.map((msg) => ({
    id: msg.id,
    createdAt: msg.createdAt.toISOString(),
    type: msg.type,
    body: msg.body,
    isQuestion: msg.isQuestion,
    senderDisplayName: msg.sender ? formatDisplayName(msg.sender) : null,
    recipientDisplayName: msg.recipient ? formatDisplayName(msg.recipient) : null,
  }));

  const room = membership?.room ?? await prisma.room.findUnique({ where: { id: roomId } });

  return NextResponse.json({
    roomNumber: room?.roomNumber ?? 0,
    topic: round.topic,
    roundNumber: round.roundNumber,
    role: membership ? (ROLE_LABELS[membership.assignedRole] ?? membership.assignedRole) : "Admin",
    displayName: isAdmin ? "Admin" : formatDisplayName(session.user),
    messages,
  });
}
