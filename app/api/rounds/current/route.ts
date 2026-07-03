import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const ROUND_SELECT = {
  id: true,
  roundNumber: true,
  topic: true,
  status: true,
  durationSeconds: true,
  startsAt: true,
  endsAt: true,
  expectedStudents: true,
  rooms: true
} as const;

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "STUDENT");
  if (response) return response;

  const userId = session.user.id;

  const activeMembership = await prisma.roomMembership.findFirst({
    where: {
      userId,
      round: { status: "ACTIVE" }
    },
    orderBy: { createdAt: "desc" },
    include: {
      room: true,
      round: { select: ROUND_SELECT }
    }
  });

  if (activeMembership) {
    return NextResponse.json({
      round: activeMembership.round,
      membership: {
        ...activeMembership,
        round: undefined
      }
    });
  }

  const scheduledMembership = await prisma.roomMembership.findFirst({
    where: {
      userId,
      round: { status: "SCHEDULED" }
    },
    orderBy: { createdAt: "desc" },
    include: {
      room: true,
      round: { select: ROUND_SELECT }
    }
  });

  if (!scheduledMembership) {
    return NextResponse.json({ round: null, membership: null });
  }

  return NextResponse.json({
    round: scheduledMembership.round,
    membership: {
      ...scheduledMembership,
      round: undefined
    }
  });
}
