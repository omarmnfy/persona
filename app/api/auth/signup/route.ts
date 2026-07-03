import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookies } from "@/lib/auth";
import { hashJoinCode } from "@/lib/joinCode";
import { rateLimit } from "@/lib/rateLimit";
import { validatePassword } from "@/lib/password";
import { isValidSchool } from "@/lib/personaCatalog";
import { generateAssignedName } from "@/lib/personaIdentity";
import { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const limit = rateLimit(`signup:${ip}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const { joinCode, firstName, lastName, school, email, password } = body as {
    joinCode?: string;
    firstName?: string;
    lastName?: string;
    school?: string;
    email?: string;
    password?: string;
  };

  if (!joinCode || !firstName || !lastName || !school || !email || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedFirstName = firstName.trim().replace(/\s+/g, " ");
  const normalizedLastName = lastName.trim().replace(/\s+/g, " ");
  const normalizedSchool = school.trim();
  const realName = `${normalizedFirstName} ${normalizedLastName}`.trim();

  if (!normalizedFirstName || !normalizedLastName) {
    return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  }
  if (!isValidSchool(normalizedSchool)) {
    return NextResponse.json({ error: "Please choose a valid school" }, { status: 400 });
  }

  const config = await prisma.classConfig.findFirst();
  if (!config?.joinCodeHash) {
    return NextResponse.json({ error: "Join code not configured" }, { status: 400 });
  }

  const hashed = hashJoinCode(joinCode);
  if (hashed !== config.joinCodeHash) {
    return NextResponse.json({ error: "Invalid join code" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing && existing.isActive) {
    return NextResponse.json({ error: "Account already exists" }, { status: 409 });
  }

  const validation = validatePassword(password);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Strong passwords must include 8+ chars, uppercase, lowercase, number, and symbol." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);

  let user = null;
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
              realName,
              firstName: normalizedFirstName,
              lastName: normalizedLastName,
              school: normalizedSchool,
              assignedName,
              passwordHash,
              accountType: "STUDENT",
              isActive: true
            }
          });
        }

        return tx.user.create({
          data: {
            email: normalizedEmail,
            realName,
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            school: normalizedSchool,
            assignedName,
            passwordHash,
            accountType: "STUDENT",
            isActive: true
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
    return NextResponse.json({ error: "Unable to create account" }, { status: 500 });
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
  setSessionCookies(response, session, "STUDENT");
  return response;
}
