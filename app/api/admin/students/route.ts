import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf, hashPassword } from "@/lib/auth";
import { AccountType, Prisma } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import { getOnlineUserIds } from "@/server/presenceStore";
import { generateInviteToken, hashInviteToken } from "@/lib/invite";
import { sendInviteEmail } from "@/lib/mailer";
import { logAdminAction } from "@/lib/audit";
import { emitAdminUpdate } from "@/server/events";
import crypto from "crypto";
import { PERSONA_NAME_POOL, parseFullName, isValidSchool } from "@/lib/personaCatalog";
import { generateAssignedName } from "@/lib/personaIdentity";

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeRound = await prisma.round.findFirst({ where: { status: "ACTIVE" } });
  const roundForAssignments =
    activeRound ??
    (await prisma.round.findFirst({ where: { status: "SCHEDULED" }, orderBy: { roundNumber: "desc" } }));

  const students = await prisma.user.findMany({
    where: { accountType: AccountType.STUDENT },
    orderBy: { createdAt: "desc" }
  });

  const onlineIds = getOnlineUserIds();
  const memberships = roundForAssignments
    ? await prisma.roomMembership.findMany({
        where: { roundId: roundForAssignments.id },
        include: { room: true }
      })
    : [];

  const membershipMap = new Map(memberships.map((m) => [m.userId, m]));
  const usedPoolNames = new Set(
    students
      .map((student) => student.assignedName)
      .filter((name): name is string => Boolean(name && PERSONA_NAME_POOL.includes(name as any)))
  );
  const availableAssignedNames = PERSONA_NAME_POOL.filter((name) => !usedPoolNames.has(name));

  return NextResponse.json({
    availableAssignedNames,
    students: students.map((student) => {
      const membership = membershipMap.get(student.id);
      return {
        id: student.id,
        realName: student.realName,
        assignedName: student.assignedName,
        school: student.school,
        email: student.email,
        isActive: student.isActive,
        lastSeenAt: student.lastSeenAt,
        isOnline: onlineIds.has(student.id),
        assignedRoom: membership?.room ? `Room ${membership.room.roomNumber}` : null,
        assignedRole: membership?.assignedRole ?? null,
        roomId: membership?.roomId ?? null
      };
    })
  });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { realName, email } = body as { realName?: string; email?: string };
  if (!realName || !email) {
    return NextResponse.json({ error: "Name and email required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName = realName.trim().replace(/\s+/g, " ");
  const nameParts = parseFullName(normalizedName);
  if (!nameParts.firstName || !nameParts.lastName) {
    return NextResponse.json({ error: "Please provide first and last name" }, { status: 400 });
  }
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (user && user.isActive) {
    return NextResponse.json({ error: "Student already active" }, { status: 400 });
  }

  const tempPassword = crypto.randomBytes(16).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      user = await prisma.$transaction(async (tx) => {
        const current = await tx.user.findUnique({ where: { email: normalizedEmail } });
        const assignedName =
          current?.assignedName ?? (await generateAssignedName(tx, current?.id));
        if (current) {
          return tx.user.update({
            where: { id: current.id },
            data: {
              realName: nameParts.realName,
              firstName: nameParts.firstName,
              lastName: nameParts.lastName,
              assignedName,
              accountType: AccountType.STUDENT,
              isActive: false
            }
          });
        }

        return tx.user.create({
          data: {
            email: normalizedEmail,
            realName: nameParts.realName,
            firstName: nameParts.firstName,
            lastName: nameParts.lastName,
            assignedName,
            passwordHash,
            accountType: AccountType.STUDENT,
            isActive: false
          }
        });
      });
      break;
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!retryable || attempt === 4) throw error;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Unable to create student" }, { status: 500 });
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  await prisma.inviteToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  const inviteUrl = `${appBaseUrl}/invite/${token}`;
  const sent = await sendInviteEmail({ to: normalizedEmail, inviteUrl, realName: nameParts.realName });

  await logAdminAction(session.user.id, "students.add", {
    email: normalizedEmail,
    realName: nameParts.realName,
    sent
  });
  emitAdminUpdate({ type: "students", action: "add", email: normalizedEmail, sent });

  return NextResponse.json({ inviteUrl, sent });
}

export async function PATCH(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { userId, assignedName, school } = body as { userId?: string; assignedName?: string; school?: string };
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.accountType !== AccountType.STUDENT) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  if (typeof school === "string") {
    const trimmedSchool = school.trim();
    if (!isValidSchool(trimmedSchool) && trimmedSchool !== "") {
      return NextResponse.json({ error: "Invalid school option" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { school: trimmedSchool || null },
    });
    await logAdminAction(session.user.id, "students.school.update", { userId, school: trimmedSchool });
    emitAdminUpdate({ type: "students", action: "school.update", userId });
    return NextResponse.json({ ok: true });
  }

  if (!assignedName) {
    return NextResponse.json({ error: "Missing assignedName or school" }, { status: 400 });
  }

  const normalizedName = assignedName.trim();
  if (!PERSONA_NAME_POOL.includes(normalizedName as any)) {
    return NextResponse.json(
      { error: "Assigned name must come from the available names list" },
      { status: 400 }
    );
  }

  if (user.assignedName === normalizedName) {
    return NextResponse.json({ ok: true });
  }

  const existing = await prisma.user.findFirst({
    where: {
      assignedName: normalizedName,
      id: { not: userId }
    },
    select: { id: true }
  });
  if (existing) {
    return NextResponse.json({ error: "That assigned name is already in use" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { assignedName: normalizedName }
    });

    await tx.roomMembership.updateMany({
      where: {
        userId,
        joinedAt: null,
        round: { status: { in: ["SCHEDULED", "ACTIVE"] } }
      },
      data: { nicknameUsed: normalizedName }
    });
  });

  await logAdminAction(session.user.id, "students.assignedName.update", {
    userId,
    assignedName: normalizedName
  });
  emitAdminUpdate({ type: "students", action: "assignedName.update", userId });

  return NextResponse.json({ ok: true });
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
  const { userId } = body as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.accountType !== AccountType.STUDENT) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.message.updateMany({
      where: { senderId: userId },
      data: { senderId: null }
    }),
    prisma.message.updateMany({
      where: { recipientId: userId },
      data: { recipientId: null }
    }),
    prisma.interrogatorGuess.deleteMany({
      where: { OR: [{ interrogatorId: userId }, { guessedUserId: userId }] }
    }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.inviteToken.deleteMany({ where: { userId } }),
    prisma.roomMembership.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } })
  ]);

  await logAdminAction(session.user.id, "students.delete", {
    userId,
    email: user.email
  });
  emitAdminUpdate({ type: "students", action: "delete", userId });

  return NextResponse.json({ ok: true });
}
