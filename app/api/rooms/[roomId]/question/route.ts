import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  if (session.user.accountType === "STUDENT") {
    const membership = await prisma.roomMembership.findFirst({
      where: { roomId, userId: session.user.id, round: { status: "ACTIVE" } }
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const now = new Date();
  const question = await prisma.message.findFirst({
    where: {
      roomId,
      isQuestion: true,
      questionEndsAt: { gt: now }
    },
    orderBy: { createdAt: "desc" },
    select: {
      questionId: true,
      body: true,
      createdAt: true,
      questionEndsAt: true
    }
  });

  if (!question?.questionId || !question.questionEndsAt) {
    return NextResponse.json({ activeQuestion: null, hasSubmitted: false });
  }

  let hasSubmitted = false;
  if (session.user.accountType === "STUDENT") {
    const submitted = await prisma.message.findFirst({
      where: {
        roomId,
        questionId: question.questionId,
        senderId: session.user.id
      },
      select: { id: true }
    });
    hasSubmitted = Boolean(submitted);
  }

  return NextResponse.json({
    activeQuestion: {
      id: question.questionId,
      body: question.body,
      endsAt: question.questionEndsAt,
      durationSeconds: Math.max(
        1,
        Math.round(
          (question.questionEndsAt.getTime() - question.createdAt.getTime()) / 1000
        )
      )
    },
    hasSubmitted
  });
}
