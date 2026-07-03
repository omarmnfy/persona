import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "STUDENT");
  if (response) return response;

  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      realName: session.user.realName,
      assignedName: session.user.assignedName,
      school: session.user.school,
      nickname: session.user.nickname,
      accountType: session.user.accountType
    }
  });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "STUDENT");
  if (response) return response;

  const csrf = requireCsrf(request, session, "STUDENT");
  if (csrf) return csrf;

  const body = await request.json();
  const { nickname } = body as { nickname?: string };

  const activeRound = await prisma.round.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { roundNumber: "desc" }
  });
  let currentMembership = null;

  if (activeRound) {
    currentMembership = await prisma.roomMembership.findFirst({
      where: { userId: session.user.id, roundId: activeRound.id },
      include: { round: true }
    });
  } else {
    const scheduledRound = await prisma.round.findFirst({
      where: { status: "SCHEDULED", memberships: { some: { userId: session.user.id } } },
      orderBy: { roundNumber: "desc" }
    });
    if (scheduledRound) {
      currentMembership = await prisma.roomMembership.findFirst({
        where: { userId: session.user.id, roundId: scheduledRound.id },
        include: { round: true }
      });
    }
  }

  if (currentMembership?.round.status === "ACTIVE" && currentMembership.joinedAt) {
    return NextResponse.json(
      { error: "Nickname cannot be changed during active room" },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { nickname: nickname?.trim() || null }
  });

  if (currentMembership && !currentMembership.joinedAt) {
    await prisma.roomMembership.update({
      where: { id: currentMembership.id },
      data: { nicknameUsed: user.assignedName ?? user.nickname ?? user.realName }
    });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      realName: user.realName,
      assignedName: user.assignedName,
      school: user.school,
      nickname: user.nickname
    }
  });
}
