import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/authz";

type ViewerType = "ADMIN" | "STUDENT";

function formatDisplayName(
  user: { accountType: "ADMIN" | "SUPER_ADMIN" | "STUDENT"; realName: string; assignedName?: string | null; nickname?: string | null },
  viewer: ViewerType
) {
  if (user.accountType === "ADMIN" || user.accountType === "SUPER_ADMIN") {
    return user.realName;
  }
  const assignedName = user.assignedName ?? user.nickname ?? user.realName;
  if (viewer === "ADMIN" && assignedName !== user.realName) {
    return `${user.realName} (${assignedName})`;
  }
  return assignedName;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");
  const { session, response } = await requireUser(
    request,
    role === "ADMIN" || role === "STUDENT" ? role : undefined
  );
  if (response) return response;

  const { roomId } = await params;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const userIsAdmin = isAdmin(session.user.accountType);
  if (!userIsAdmin) {
    const membership = await prisma.roomMembership.findFirst({
      where: { roomId, userId: session.user.id, round: { status: "ACTIVE" } }
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const now = new Date();
  const messages = await prisma.message.findMany({
    where:
      userIsAdmin
        ? {
            roomId,
            OR: [{ revealAt: null }, { revealAt: { lte: now } }]
          }
        : {
            roomId,
            AND: [
              {
                OR: [
                  { recipientId: null },
                  { senderId: session.user.id },
                  { recipientId: session.user.id }
                ]
              },
              {
                OR: [{ revealAt: null }, { revealAt: { lte: now } }]
              }
            ]
          },
    include: { sender: true, recipient: true },
    orderBy: { createdAt: "asc" }
  });

  const viewer: ViewerType = userIsAdmin ? "ADMIN" : "STUDENT";
  const payload = messages.map((msg) => ({
    id: msg.id,
    createdAt: msg.createdAt,
    type: msg.type,
    body: msg.body,
    isQuestion: msg.isQuestion,
    questionId: msg.questionId,
    questionEndsAt: msg.questionEndsAt,
    sender: msg.sender
      ? {
          id: msg.sender.id,
          displayName: formatDisplayName(
            {
              accountType: msg.sender.accountType,
              realName: msg.sender.realName,
              assignedName: msg.sender.assignedName,
              nickname: msg.sender.nickname
            },
            viewer
          )
        }
      : null,
    recipient: msg.recipient
      ? {
          id: msg.recipient.id,
          displayName: formatDisplayName(
            {
              accountType: msg.recipient.accountType,
              realName: msg.recipient.realName,
              assignedName: msg.recipient.assignedName,
              nickname: msg.recipient.nickname
            },
            viewer
          )
        }
      : null
  }));

  return NextResponse.json({ messages: payload });
}
