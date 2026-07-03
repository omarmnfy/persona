import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { AccountType, Role } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import { logAdminAction } from "@/lib/audit";
import { emitAdminUpdate, emitRoundUpdate } from "@/server/events";
import { generateRoomName } from "@/lib/assign";

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { roundId, userId, roomId, role } = body as {
    roundId?: string;
    userId?: string;
    roomId?: string | null;
    role?: Role;
  };
  const forceUnlock = true;

  if (!roundId || !userId) {
    return NextResponse.json({ error: "Missing roundId or userId" }, { status: 400 });
  }

  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (round.assignmentsLocked && !forceUnlock) {
    return NextResponse.json({ error: "Assignments are locked" }, { status: 400 });
  }

  let normalizedRole = role ?? Role.WAITING;

  if ((normalizedRole as string) === "AUTO" && roomId) {
    const existingRoles = await prisma.roomMembership.findMany({
      where: { roundId, roomId, userId: { not: userId }, assignedRole: { not: Role.WAITING } },
      select: { assignedRole: true }
    });
    const takenRoles = new Set(existingRoles.map((m) => m.assignedRole));
    const allRoles = [Role.INTERROGATOR, Role.REAL, Role.FAKE] as const;
    const available = allRoles.filter((r) => !takenRoles.has(r));

    if (available.length === 0) {
      return NextResponse.json({ error: "Room already has all 3 roles filled" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { school: true } });
    const canBeReal = targetUser?.school && targetUser.school !== "Other";
    const preferred = canBeReal ? available : available.filter((r) => r !== Role.REAL);
    normalizedRole = (preferred.length > 0 ? preferred[0] : available[0]) as Role;
  }

  let normalizedRoomId = normalizedRole === Role.WAITING ? null : roomId ?? null;

  if (normalizedRole === Role.REAL) {
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { school: true } });
    if (!targetUser?.school || targetUser.school === "Other") {
      normalizedRole = Role.WAITING;
      normalizedRoomId = null;
      return NextResponse.json(
        { error: "Students with 'Other' school cannot be assigned as True Collegian" },
        { status: 400 }
      );
    }
  }

  if (normalizedRoomId) {
    const count = await prisma.roomMembership.count({
      where: {
        roundId,
        roomId: normalizedRoomId,
        userId: { not: userId },
        assignedRole: { not: Role.WAITING }
      }
    });
    if (count >= 3 && !forceUnlock) {
      return NextResponse.json({ error: "Room already has 3 participants" }, { status: 400 });
    }
  }

  const membership = await prisma.roomMembership.findFirst({
    where: { roundId, userId }
  });
  if (!membership) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  if (normalizedRoomId && normalizedRole !== Role.WAITING) {
    const conflict = await prisma.roomMembership.findFirst({
      where: {
        roundId,
        roomId: normalizedRoomId,
        assignedRole: normalizedRole,
        userId: { not: userId }
      }
    });
    if (conflict) {
      await prisma.roomMembership.update({
        where: { id: conflict.id },
        data: { roomId: null, assignedRole: Role.WAITING }
      });
      emitAdminUpdate({ type: "membership", action: "update", roundId, userId: conflict.userId });
      emitRoundUpdate({ type: "membership", action: "update", roundId, userId: conflict.userId });
    }
  }

  const updated = await prisma.roomMembership.update({
    where: { id: membership.id },
    data: {
      roomId: normalizedRoomId,
      assignedRole: normalizedRole
    }
  });

  if (normalizedRoomId && normalizedRole === Role.REAL) {
    const realUser = await prisma.user.findUnique({ where: { id: userId }, select: { school: true } });
    const newName = generateRoomName(realUser?.school);
    await prisma.room.update({ where: { id: normalizedRoomId }, data: { name: newName } });
  }

  if (normalizedRoomId && normalizedRole !== Role.REAL) {
    const remainingReal = await prisma.roomMembership.findFirst({
      where: { roomId: normalizedRoomId, assignedRole: Role.REAL, userId: { not: userId } },
      include: { user: { select: { school: true } } }
    });
    if (remainingReal) {
      await prisma.room.update({ where: { id: normalizedRoomId }, data: { name: generateRoomName(remainingReal.user.school) } });
    } else {
      await prisma.room.update({ where: { id: normalizedRoomId }, data: { name: null } });
    }
  }

  await logAdminAction(session.user.id, "membership.update", {
    roundId,
    userId,
    roomId: normalizedRoomId,
    role: normalizedRole
  });

  emitAdminUpdate({ type: "membership", action: "update", roundId, userId });
  emitRoundUpdate({ type: "membership", action: "update", roundId, userId });

  return NextResponse.json({ membership: updated });
}

export async function PUT(request: NextRequest) {
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
  if (round.status === "ENDED") {
    return NextResponse.json({ error: "Cannot add rooms to an ended round" }, { status: 400 });
  }

  const lastRoom = await prisma.room.findFirst({
    where: { roundId },
    orderBy: { roomNumber: "desc" },
    select: { roomNumber: true }
  });
  const nextNumber = (lastRoom?.roomNumber ?? 0) + 1;

  const room = await prisma.room.create({
    data: {
      roundId,
      roomNumber: nextNumber,
      status: round.status === "ACTIVE" ? "ACTIVE" : "NOT_STARTED"
    }
  });

  await logAdminAction(session.user.id, "room.create", { roundId, roomId: room.id, roomNumber: nextNumber });
  emitAdminUpdate({ type: "rooms", action: "create", roundId });
  emitRoundUpdate({ type: "rooms", action: "create", roundId });

  return NextResponse.json({ room });
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
  const { roomId } = body as { roomId?: string };
  if (!roomId) {
    return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { round: true }
  });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.round.status === "ACTIVE") {
    return NextResponse.json({ error: "Cannot delete room during an active round" }, { status: 400 });
  }

  await prisma.room.delete({ where: { id: roomId } });

  await logAdminAction(session.user.id, "room.delete", {
    roundId: room.roundId,
    roomId
  });

  emitAdminUpdate({ type: "rooms", action: "delete", roundId: room.roundId, roomId });
  emitRoundUpdate({ type: "rooms", action: "delete", roundId: room.roundId, roomId });

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestedRoundId = request.nextUrl.searchParams.get("roundId");

  let targetRound;
  if (requestedRoundId) {
    targetRound = await prisma.round.findUnique({
      where: { id: requestedRoundId },
      include: {
        rooms: {
          include: {
            memberships: {
              include: { user: true }
            }
          },
          orderBy: { roomNumber: "asc" }
        }
      }
    });
  } else {
    targetRound = await prisma.round.findFirst({
      where: { status: "ACTIVE" },
      include: {
        rooms: {
          include: {
            memberships: {
              include: { user: true }
            }
          },
          orderBy: { roomNumber: "asc" }
        }
      }
    });

    if (!targetRound) {
      targetRound = await prisma.round.findFirst({
        where: { status: "SCHEDULED" },
        orderBy: { roundNumber: "desc" },
        include: {
          rooms: {
            include: {
              memberships: {
                include: { user: true }
              }
            },
            orderBy: { roomNumber: "asc" }
          }
        }
      });
    }
  }

  if (targetRound && targetRound.status === "SCHEDULED") {
    const existingUserIds = new Set(
      (await prisma.roomMembership.findMany({
        where: { roundId: targetRound.id },
        select: { userId: true }
      })).map((m) => m.userId)
    );

    const activeStudents = await prisma.user.findMany({
      where: { accountType: "STUDENT", isActive: true },
      select: { id: true, realName: true, assignedName: true, nickname: true }
    });

    const newStudents = activeStudents.filter((s) => !existingUserIds.has(s.id));
    if (newStudents.length > 0) {
      await prisma.roomMembership.createMany({
        data: newStudents.map((s) => ({
          roundId: targetRound.id,
          roomId: null,
          userId: s.id,
          assignedRole: Role.WAITING as Role,
          nicknameUsed: s.assignedName ?? s.nickname ?? s.realName
        }))
      });
    }
  }

  const waitingMembers = targetRound
    ? await prisma.roomMembership.findMany({
        where: { roundId: targetRound.id, roomId: null, assignedRole: "WAITING" },
        include: { user: true }
      })
    : [];

  return NextResponse.json({
    round: targetRound,
    rooms:
      targetRound?.rooms.map((room) => ({
        id: room.id,
        roomNumber: room.roomNumber,
        name: room.name ?? null,
        status: room.status,
        participants: room.memberships.map((m) => ({
          userId: m.userId,
          displayName:
            m.nicknameUsed && m.nicknameUsed !== m.user.realName
              ? `${m.user.realName} (${m.nicknameUsed})`
              : m.user.realName,
          realName: m.user.realName,
          assignedName: m.nicknameUsed,
          role: m.assignedRole,
          school: m.user.school ?? null
        })).sort((a, b) => {
          const order: Record<string, number> = { INTERROGATOR: 0, REAL: 1, FAKE: 2, WAITING: 3 };
          return (order[a.role] ?? 4) - (order[b.role] ?? 4);
        })
      })) ?? [],
    waiting: waitingMembers.map((m) => ({
      userId: m.userId,
      realName: m.user.realName,
      assignedName: m.nicknameUsed,
      school: m.user.school ?? null
    }))
  });
}
