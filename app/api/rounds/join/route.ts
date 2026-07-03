import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { hashJoinCode } from "@/lib/joinCode";
import { emitAdminUpdate, emitRoundUpdate } from "@/server/events";
import { Role } from "@prisma/client";
import { generateAssignedName } from "@/lib/personaIdentity";

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "STUDENT");
  if (response) return response;

  const csrf = requireCsrf(request, session, "STUDENT");
  if (csrf) return csrf;

  const body = await request.json();
  const codeRaw = (body?.code ?? "").toString().trim();
  if (!codeRaw) {
    return NextResponse.json({ error: "Round code required" }, { status: 400 });
  }

  const code = codeRaw.toUpperCase();
  const hash = hashJoinCode(code);

  const round = await prisma.round.findFirst({
    where: { joinCodeHash: hash, status: { in: ["SCHEDULED", "ACTIVE"] } },
    orderBy: { roundNumber: "desc" },
    select: {
      id: true,
      roundNumber: true,
      topic: true,
      status: true,
      durationSeconds: true,
      startsAt: true,
      endsAt: true,
      expectedStudents: true
    }
  });

  if (!round) {
    return NextResponse.json({ error: "Invalid or expired round code" }, { status: 404 });
  }

  try {
    const membership = await prisma.$transaction(async (tx) => {
      const existing = await tx.roomMembership.findFirst({
        where: { roundId: round.id, userId: session.user.id },
        include: { room: true }
      });
      if (existing) return existing;

      if (round.expectedStudents) {
        const assignedCount = await tx.roomMembership.count({
          where: {
            roundId: round.id,
            assignedRole: { in: [Role.REAL, Role.FAKE, Role.INTERROGATOR] }
          }
        });
        if (assignedCount >= round.expectedStudents) {
          throw new Error("Round is full");
        }
      }

      const rooms = await tx.room.findMany({
        where: { roundId: round.id },
        orderBy: { roomNumber: "asc" },
        include: { memberships: true }
      });

      let targetRoom = rooms.find((room) =>
        room.memberships.filter((m) => m.assignedRole !== Role.WAITING).length < 3
      );
      const assignedRoles = new Set(targetRoom?.memberships.map((m) => m.assignedRole) ?? []);

      if (!targetRoom) {
        const nextRoomNumber = rooms.length
          ? Math.max(...rooms.map((room) => room.roomNumber)) + 1
          : 1;
        const createdRoom = await tx.room.create({
          data: {
            roundId: round.id,
            roomNumber: nextRoomNumber,
            status: round.status === "ACTIVE" ? "ACTIVE" : "NOT_STARTED"
          }
        });
        targetRoom = { ...createdRoom, memberships: [] };
      }

      const availableRoles = [Role.REAL, Role.FAKE, Role.INTERROGATOR].filter(
        (role) => !assignedRoles.has(role)
      );
      const role =
        availableRoles[Math.floor(Math.random() * availableRoles.length)] ?? Role.REAL;

      const user = await tx.user.findUnique({ where: { id: session.user.id } });
      if (!user) throw new Error("User not found");
      let assignedName = user.assignedName;
      if (!assignedName) {
        assignedName = await generateAssignedName(tx, user.id);
        await tx.user.update({
          where: { id: user.id },
          data: { assignedName }
        });
      }

      const created = await tx.roomMembership.create({
        data: {
          roundId: round.id,
          roomId: targetRoom.id,
          userId: user.id,
          assignedRole: role,
          nicknameUsed: assignedName ?? user.nickname ?? user.realName
        }
      });

      return { ...created, room: targetRoom };
    });

    emitAdminUpdate({ type: "membership", action: "join", roundId: round.id });
    emitRoundUpdate({ type: "membership", action: "join", roundId: round.id });

    return NextResponse.json({ round, membership });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Unable to join round" }, { status: 400 });
  }
}
