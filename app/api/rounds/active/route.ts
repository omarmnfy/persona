import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "STUDENT");
  if (response) return response;

  const round = await prisma.round.findFirst({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      roundNumber: true,
      topic: true,
      status: true,
      durationSeconds: true,
      startsAt: true,
      endsAt: true,
      expectedStudents: true,
      rooms: true
    }
  });

  if (!round) {
    return NextResponse.json({ round: null });
  }

  const membership = await prisma.roomMembership.findFirst({
    where: { roundId: round.id, userId: session.user.id },
    include: { room: true }
  });

  return NextResponse.json({
    round,
    membership
  });
}
