import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/authz";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const discussionSession = await prisma.discussionSession.findUnique({
    where: { id: sessionId },
    include: {
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: {
          rooms: {
            orderBy: { roomNumber: "asc" },
            include: {
              memberships: {
                include: { user: { select: { id: true, realName: true, assignedName: true, nickname: true, email: true, accountType: true } } }
              },
              messages: {
                orderBy: { createdAt: "asc" },
                include: {
                  sender: { select: { id: true, realName: true, assignedName: true, nickname: true, accountType: true } },
                  recipient: { select: { id: true, realName: true, assignedName: true, nickname: true, accountType: true } }
                }
              },
              guesses: true
            }
          },
          memberships: {
            include: { user: { select: { id: true, realName: true, assignedName: true, nickname: true, email: true } } }
          },
          guesses: true
        }
      }
    }
  });

  if (!discussionSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const studentMap = new Map<string, {
    id: string;
    realName: string;
    assignedName: string | null;
    nickname: string | null;
    email: string;
  }>();

  const roleHistory: Record<string, Record<string, string>> = {};
  const roomHistory: Record<string, Record<string, number>> = {};
  const poserSuccesses: Record<string, number> = {};
  const poserTotal: Record<string, number> = {};
  const trueCollegianSuccesses: Record<string, number> = {};
  const trueCollegianTotal: Record<string, number> = {};
  const interrogatorCorrect: Record<string, number> = {};
  const interrogatorTotal: Record<string, number> = {};
  const outcomeHistory: Record<string, Record<string, string>> = {};

  for (const round of discussionSession.rounds) {
    for (const membership of round.memberships) {
      const userId = membership.userId;
      studentMap.set(userId, membership.user);

      if (!roleHistory[userId]) roleHistory[userId] = {};
      roleHistory[userId][round.id] = membership.assignedRole;

      if (!outcomeHistory[userId]) outcomeHistory[userId] = {};
    }

    for (const room of round.rooms) {
      const membershipsByUser = new Map<string, string>();
      for (const m of room.memberships) {
        membershipsByUser.set(m.userId, m.assignedRole);
        if (!roomHistory[m.userId]) roomHistory[m.userId] = {};
        roomHistory[m.userId][round.id] = room.roomNumber;
      }

      const roomGuess = room.guesses[0];
      if (roomGuess) {
        const guess = roomGuess;
        const interrogatorId = guess.interrogatorId;
        if (!interrogatorTotal[interrogatorId]) interrogatorTotal[interrogatorId] = 0;
        if (!interrogatorCorrect[interrogatorId]) interrogatorCorrect[interrogatorId] = 0;
        interrogatorTotal[interrogatorId]++;

        if (guess.correct) {
          interrogatorCorrect[interrogatorId]++;
          outcomeHistory[interrogatorId] = outcomeHistory[interrogatorId] || {};
          outcomeHistory[interrogatorId][round.id] = "success";
        } else {
          outcomeHistory[interrogatorId] = outcomeHistory[interrogatorId] || {};
          outcomeHistory[interrogatorId][round.id] = "fail";
        }

        for (const [uid, role] of membershipsByUser.entries()) {
          if (role === "FAKE") {
            if (!poserTotal[uid]) poserTotal[uid] = 0;
            poserTotal[uid]++;
            if (!guess.correct) {
              if (!poserSuccesses[uid]) poserSuccesses[uid] = 0;
              poserSuccesses[uid]++;
              outcomeHistory[uid] = outcomeHistory[uid] || {};
              outcomeHistory[uid][round.id] = "success";
            } else {
              outcomeHistory[uid] = outcomeHistory[uid] || {};
              if (!outcomeHistory[uid][round.id]) outcomeHistory[uid][round.id] = "fail";
            }
          }
          if (role === "REAL") {
            if (!trueCollegianTotal[uid]) trueCollegianTotal[uid] = 0;
            trueCollegianTotal[uid]++;
            if (guess.correct) {
              if (!trueCollegianSuccesses[uid]) trueCollegianSuccesses[uid] = 0;
              trueCollegianSuccesses[uid]++;
              outcomeHistory[uid] = outcomeHistory[uid] || {};
              outcomeHistory[uid][round.id] = "success";
            } else {
              outcomeHistory[uid] = outcomeHistory[uid] || {};
              if (!outcomeHistory[uid][round.id]) outcomeHistory[uid][round.id] = "fail";
            }
          }
        }
      }

      for (const [uid, role] of membershipsByUser.entries()) {
        if ((role === "FAKE" || role === "REAL" || role === "INTERROGATOR") && !outcomeHistory[uid]?.[round.id]) {
          outcomeHistory[uid] = outcomeHistory[uid] || {};
          outcomeHistory[uid][round.id] = "no_guess";
        }
      }
    }
  }

  function getDisplayName(user: { accountType: string; realName: string; assignedName?: string | null; nickname?: string | null }) {
    if (user.accountType === "ADMIN" || user.accountType === "SUPER_ADMIN") return user.realName;
    return user.assignedName ?? user.nickname ?? user.realName;
  }

  const roundsDetail = discussionSession.rounds.map((round) => ({
    id: round.id,
    roundNumber: round.roundNumber,
    topic: round.topic,
    status: round.status,
    rooms: round.rooms.map((room) => ({
      roomNumber: room.roomNumber,
      name: room.name,
      participants: room.memberships.map((m) => ({
        userId: m.userId,
        realName: m.user.realName,
        displayName: getDisplayName(m.user),
        assignedRole: m.assignedRole,
        nicknameUsed: m.nicknameUsed
      })),
      messages: room.messages.map((msg) => ({
        id: msg.id,
        type: msg.type,
        body: msg.body,
        isQuestion: msg.isQuestion,
        createdAt: msg.createdAt,
        sender: msg.sender ? { id: msg.sender.id, displayName: getDisplayName(msg.sender) } : null,
        recipient: msg.recipient ? { id: msg.recipient.id, displayName: getDisplayName(msg.recipient) } : null
      })),
      guess: room.guesses[0] ? {
        interrogatorId: room.guesses[0].interrogatorId,
        guessedUserId: room.guesses[0].guessedUserId,
        correct: room.guesses[0].correct
      } : null
    }))
  }));

  const students = Array.from(studentMap.entries()).map(([id, user]) => ({
    id,
    realName: user.realName,
    assignedName: user.assignedName,
    nickname: user.nickname,
    email: user.email,
    roles: roleHistory[id] || {},
    rooms: roomHistory[id] || {},
    outcomes: outcomeHistory[id] || {},
    stats: {
      poserWins: poserSuccesses[id] ?? 0,
      poserRounds: poserTotal[id] ?? 0,
      trueCollegianWins: trueCollegianSuccesses[id] ?? 0,
      trueCollegianRounds: trueCollegianTotal[id] ?? 0,
      interrogatorWins: interrogatorCorrect[id] ?? 0,
      interrogatorRounds: interrogatorTotal[id] ?? 0
    }
  }));

  function buildLeaderboard(scores: Record<string, number>, totals?: Record<string, number>) {
    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .map(([userId, score]) => {
        const user = studentMap.get(userId);
        return {
          userId,
          realName: user?.realName ?? "Unknown",
          assignedName: user?.assignedName ?? null,
          score,
          total: totals ? (totals[userId] ?? 0) : undefined
        };
      });
  }

  const leaderboards = {
    bestPoser: buildLeaderboard(poserSuccesses, poserTotal),
    bestTrueCollegian: buildLeaderboard(trueCollegianSuccesses, trueCollegianTotal),
    bestInterrogator: buildLeaderboard(interrogatorCorrect, interrogatorTotal)
  };

  return NextResponse.json({
    session: {
      id: discussionSession.id,
      sessionNumber: discussionSession.sessionNumber,
      name: discussionSession.name,
      createdAt: discussionSession.createdAt
    },
    rounds: roundsDetail,
    students,
    leaderboards
  });
}
