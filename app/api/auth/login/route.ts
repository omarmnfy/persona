import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, setSessionCookies, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { generateAssignedName } from "@/lib/personaIdentity";
import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const limit = rateLimit(`login:${ip}`, 5, 30_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const { email, password } = body as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (!user.isActive) {
    if (user.accountType === "ADMIN" || user.accountType === "SUPER_ADMIN") {
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: true }
      });
    } else {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() }
  });

  let currentUser = user;
  if (user.accountType === "STUDENT" && !user.assignedName) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        currentUser = await prisma.$transaction(async (tx) => {
          const assignedName = await generateAssignedName(tx, user.id);
          return tx.user.update({
            where: { id: user.id },
            data: { assignedName }
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
  }

  const session = await createSession(currentUser.id);
  const response = NextResponse.json({
    user: {
      id: currentUser.id,
      email: currentUser.email,
      accountType: currentUser.accountType,
      realName: currentUser.realName,
      assignedName: currentUser.assignedName,
      nickname: currentUser.nickname,
      school: currentUser.school
    }
  });
  setSessionCookies(response, session, currentUser.accountType);
  return response;
}
