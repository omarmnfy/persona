import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookies } from "@/lib/auth";
import { hashInviteToken } from "@/lib/invite";
import { validatePassword } from "@/lib/password";
import { isValidSchool, parseFullName } from "@/lib/personaCatalog";
import { generateAssignedName } from "@/lib/personaIdentity";

function normalizeNameParts(firstName?: string, lastName?: string, fallbackRealName?: string | null) {
  const normalizedFirstName = firstName?.trim().replace(/\s+/g, " ") ?? "";
  const normalizedLastName = lastName?.trim().replace(/\s+/g, " ") ?? "";
  if (normalizedFirstName && normalizedLastName) {
    return {
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      realName: `${normalizedFirstName} ${normalizedLastName}`.trim()
    };
  }
  if (fallbackRealName) {
    const parsed = parseFullName(fallbackRealName);
    return {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      realName: parsed.realName
    };
  }
  return { firstName: "", lastName: "", realName: "" };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const tokenHash = hashInviteToken(token);
  const invite = await prisma.inviteToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  return NextResponse.json({
    invite: {
      accountType: invite.user.accountType,
      email: invite.user.email,
      realName: invite.user.realName,
      firstName: invite.user.firstName,
      lastName: invite.user.lastName
    }
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, password, firstName, lastName, school } = body as {
    token?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    school?: string;
  };
  if (!token || !password) {
    return NextResponse.json(
      { error: "Missing token or password" },
      { status: 400 }
    );
  }

  const tokenHash = hashInviteToken(token);
  const invite = await prisma.inviteToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const validation = validatePassword(password);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Strong passwords must include 8+ chars, uppercase, lowercase, number, and symbol." },
      { status: 400 }
    );
  }

  const inviteeIsStudent = invite.user.accountType === "STUDENT";
  const normalizedSchool = school?.trim() ?? "";
  if (inviteeIsStudent && !isValidSchool(normalizedSchool)) {
    return NextResponse.json({ error: "Please choose a valid school" }, { status: 400 });
  }

  const nameParts = normalizeNameParts(firstName, lastName, invite.user.realName);
  if (!nameParts.firstName || !nameParts.lastName) {
    return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  let user = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      user = await prisma.$transaction(async (tx) => {
        const current = await tx.user.findUnique({ where: { id: invite.userId } });
        if (!current) {
          throw new Error("User not found");
        }

        const assignedName =
          current.accountType === "STUDENT"
            ? current.assignedName ?? (await generateAssignedName(tx, current.id))
            : null;

        const updated = await tx.user.update({
          where: { id: invite.userId },
          data: {
            realName: nameParts.realName,
            firstName: nameParts.firstName,
            lastName: nameParts.lastName,
            school: current.accountType === "STUDENT" ? normalizedSchool : null,
            assignedName,
            passwordHash,
            isActive: true
          }
        });

        await tx.inviteToken.update({
          where: { id: invite.id },
          data: { usedAt: new Date() }
        });

        return updated;
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
    return NextResponse.json({ error: "Unable to activate invitation" }, { status: 500 });
  }

  const session = await createSession(user.id);
  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      realName: user.realName,
      assignedName: user.assignedName,
      nickname: user.nickname,
      school: user.school
    }
  });
  setSessionCookies(response, session, user.accountType);
  return response;
}
