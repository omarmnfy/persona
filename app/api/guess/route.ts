import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "STUDENT");
  if (response) return response;

  const roomId = request.nextUrl.searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
  }

  const membership = await prisma.roomMembership.findFirst({
    where: { roomId, userId: session.user.id, assignedRole: { not: Role.WAITING } }
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  if (membership.assignedRole === Role.INTERROGATOR) {
    const existing = await prisma.interrogatorGuess.findUnique({
      where: {
        roundId_roomId_interrogatorId: {
          roundId: membership.roundId,
          roomId,
          interrogatorId: session.user.id
        }
      }
    });

    if (existing) {
      return NextResponse.json({ guess: existing });
    }

    const roommates = await prisma.roomMembership.findMany({
      where: {
        roomId,
        roundId: membership.roundId,
        userId: { not: session.user.id },
        assignedRole: { not: Role.WAITING }
      },
      select: {
        userId: true,
        nicknameUsed: true,
        assignedRole: true
      }
    });

    return NextResponse.json({
      guess: null,
      candidates: roommates.map((m) => ({
        userId: m.userId,
        displayName: m.nicknameUsed
      }))
    });
  }

  const guess = await prisma.interrogatorGuess.findFirst({
    where: { roomId, roundId: membership.roundId }
  });

  if (!guess) {
    return NextResponse.json({ guess: null, waiting: true });
  }

  const wasChosen = guess.guessedUserId === session.user.id;
  const myRole = membership.assignedRole;

  return NextResponse.json({
    guess: {
      correct: guess.correct,
      wasChosen,
      myRole
    }
  });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "STUDENT");
  if (response) return response;

  const body = await request.json();
  const { roomId, guessedUserId } = body as { roomId?: string; guessedUserId?: string };

  if (!roomId || !guessedUserId) {
    return NextResponse.json({ error: "Missing roomId or guessedUserId" }, { status: 400 });
  }

  const membership = await prisma.roomMembership.findFirst({
    where: { roomId, userId: session.user.id, assignedRole: Role.INTERROGATOR }
  });
  if (!membership) {
    return NextResponse.json({ error: "Not an interrogator in this room" }, { status: 403 });
  }

  const round = await prisma.round.findUnique({ where: { id: membership.roundId } });
  if (!round || round.status !== "ENDED") {
    if (round && round.endsAt && new Date(round.endsAt).getTime() > Date.now()) {
      return NextResponse.json({ error: "Round is still active" }, { status: 400 });
    }
  }

  const existing = await prisma.interrogatorGuess.findUnique({
    where: {
      roundId_roomId_interrogatorId: {
        roundId: membership.roundId,
        roomId,
        interrogatorId: session.user.id
      }
    }
  });
  if (existing) {
    return NextResponse.json({ error: "Already guessed", guess: existing }, { status: 400 });
  }

  const guessedMembership = await prisma.roomMembership.findFirst({
    where: { roomId, roundId: membership.roundId, userId: guessedUserId, assignedRole: { not: Role.WAITING } }
  });
  if (!guessedMembership) {
    return NextResponse.json({ error: "Invalid guess target" }, { status: 400 });
  }

  const correct = guessedMembership.assignedRole === Role.REAL;

  const guess = await prisma.interrogatorGuess.create({
    data: {
      roundId: membership.roundId,
      roomId,
      interrogatorId: session.user.id,
      guessedUserId,
      correct
    }
  });

  return NextResponse.json({ guess });
}
