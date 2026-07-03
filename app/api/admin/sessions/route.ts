import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
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
  const { name, roundCount, durationMinutes, expectedStudents } = body as {
    name?: string;
    roundCount?: number;
    durationMinutes?: number;
    expectedStudents?: number;
  };

  if (!name || !roundCount || !durationMinutes || expectedStudents == null) {
    return NextResponse.json({ error: "Missing name, roundCount, durationMinutes, or expectedStudents" }, { status: 400 });
  }

  const numRounds = Math.max(1, Math.min(10, Math.floor(roundCount)));
  const expectedCount = Math.max(1, Math.floor(expectedStudents));
  const roomsPerRound = Math.max(1, Math.ceil(expectedCount / 3));

  const lastSession = await prisma.discussionSession.findFirst({ orderBy: { sessionNumber: "desc" } });
  const sessionNumber = (lastSession?.sessionNumber ?? 0) + 1;

  const lastRound = await prisma.round.findFirst({ orderBy: { roundNumber: "desc" } });
  let nextRoundNumber = (lastRound?.roundNumber ?? 0) + 1;

  const result = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.discussionSession.create({
      data: {
        sessionNumber,
        name: name.trim(),
        createdByAdminId: session.user.id
      }
    });

    const rounds: Array<{ id: string; roundNumber: number; joinCode: string }> = [];

    for (let i = 0; i < numRounds; i++) {
      const joinCode = generateJoinCode();
      const joinCodeHash = hashJoinCode(joinCode);

      const round = await tx.round.create({
        data: {
          roundNumber: nextRoundNumber + i,
          topic: name.trim(),
          status: "SCHEDULED",
          seed: null,
          durationSeconds: Math.floor(durationMinutes * 60),
          autoReshuffle: false,
          expectedStudents: expectedCount,
          joinCodeHash,
          joinCodePlain: joinCode,
          joinCodeCreatedAt: new Date(),
          createdByAdminId: session.user.id,
          sessionId: createdSession.id
        }
      });

      await tx.room.createMany({
        data: Array.from({ length: roomsPerRound }, (_, idx) => ({
          roundId: round.id,
          roomNumber: idx + 1,
          status: "NOT_STARTED" as const
        }))
      });

      rounds.push({ id: round.id, roundNumber: round.roundNumber, joinCode });
    }

    return { session: createdSession, rounds };
  });

  emitAdminUpdate({ type: "rounds", action: "created" });
  emitRoundUpdate({ type: "rounds", action: "created" });

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = await prisma.discussionSession.findMany({
    orderBy: { sessionNumber: "desc" },
    include: {
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: { rooms: true }
      }
    }
  });

  const unsessionedRounds = await prisma.round.findMany({
    where: { sessionId: null },
    orderBy: { roundNumber: "desc" },
    include: { rooms: true }
  });

  return NextResponse.json({ sessions, unsessionedRounds });
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
  const { sessionId } = body as { sessionId?: string };
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const ds = await prisma.discussionSession.findUnique({
    where: { id: sessionId },
    include: { rounds: { select: { id: true, status: true } } }
  });
  if (!ds) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const hasActive = ds.rounds.some((r) => r.status === "ACTIVE");
  if (hasActive) {
    return NextResponse.json({ error: "Cannot delete a session with an active round. End all rounds first." }, { status: 400 });
  }

  await prisma.discussionSession.delete({ where: { id: sessionId } });

  emitAdminUpdate({ type: "rounds", action: "delete" });
  emitRoundUpdate({ type: "rounds", action: "delete" });

  return NextResponse.json({ ok: true });
}
