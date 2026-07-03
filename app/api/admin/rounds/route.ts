import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { AccountType } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import { emitAdminUpdate, emitRoundUpdate } from "@/server/events";
import { generateJoinCode, hashJoinCode } from "@/lib/joinCode";

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { topic, durationMinutes, expectedStudents } = body as {
    topic?: string;
    durationMinutes?: number;
    expectedStudents?: number;
  };

  if (!topic || !durationMinutes || expectedStudents == null) {
    return NextResponse.json({ error: "Missing topic, duration, or expected students" }, { status: 400 });
  }
  const expectedCount = Math.floor(expectedStudents);
  if (expectedCount < 1) {
    return NextResponse.json({ error: "Expected students must be at least 1" }, { status: 400 });
  }

  const lastRound = await prisma.round.findFirst({ orderBy: { roundNumber: "desc" } });
  const roundNumber = (lastRound?.roundNumber ?? 0) + 1;
  const joinCode = generateJoinCode();
  const joinCodeHash = hashJoinCode(joinCode);
  const roomsToCreate = Math.max(1, Math.ceil(expectedCount / 3));

  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.round.create({
      data: {
        roundNumber,
        topic: topic.trim(),
        status: "SCHEDULED",
        seed: null,
        durationSeconds: Math.floor(durationMinutes * 60),
        autoReshuffle: false,
        expectedStudents: expectedCount,
        joinCodeHash,
        joinCodePlain: joinCode,
        joinCodeCreatedAt: new Date(),
        createdByAdminId: session.user.id
      }
    });

    await tx.room.createMany({
      data: Array.from({ length: roomsToCreate }, (_, index) => ({
        roundId: created.id,
        roomNumber: index + 1,
        status: "NOT_STARTED"
      }))
    });

    return created;
  });

  emitAdminUpdate({ type: "rounds", action: "created", roundId: round.id });
  emitRoundUpdate({ type: "rounds", action: "created", roundId: round.id });

  return NextResponse.json({ round, joinCode });
}

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rounds = await prisma.round.findMany({
    orderBy: { roundNumber: "desc" },
    include: { rooms: true }
  });

  return NextResponse.json({ rounds });
}

export async function DELETE(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { roundId } = body as { roundId?: string };
  if (!roundId) {
    return NextResponse.json({ error: "Missing roundId" }, { status: 400 });
  }

  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.status === "ACTIVE") {
    return NextResponse.json({ error: "Cannot delete an active round" }, { status: 400 });
  }

  await prisma.round.delete({ where: { id: roundId } });

  emitAdminUpdate({ type: "rounds", action: "delete", roundId });
  emitRoundUpdate({ type: "rounds", action: "delete", roundId });

  return NextResponse.json({ ok: true });
}
