import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf, hashPassword } from "@/lib/auth";
import { hashInviteToken, generateInviteToken } from "@/lib/invite";
import { AccountType, Prisma } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import crypto from "crypto";
import { logAdminAction } from "@/lib/audit";
import { sendInviteEmail } from "@/lib/mailer";
import { emitAdminUpdate } from "@/server/events";
import { parseFullName } from "@/lib/personaCatalog";
import { generateAssignedName } from "@/lib/personaIdentity";

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { csv } = body as { csv?: string };
  if (!csv) {
    return NextResponse.json({ error: "Missing CSV" }, { status: 400 });
  }

  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Array<{ realName?: string; email?: string }>;

  const inviteLinks: Array<{ email: string; inviteUrl: string; sent: boolean }> = [];
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  for (const row of rows) {
    if (!row.email || !row.realName) continue;
    const email = row.email.toLowerCase();
    const parsed = parseFullName(row.realName.trim());
    if (!parsed.firstName || !parsed.lastName) continue;

    const tempPassword = crypto.randomBytes(16).toString("base64url");
    const tempHash = await hashPassword(tempPassword);
    let user = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        user = await prisma.$transaction(async (tx) => {
          const existing = await tx.user.findUnique({ where: { email } });
          if (existing) return null;
          const assignedName = await generateAssignedName(tx);
          return tx.user.create({
            data: {
              email,
              realName: parsed.realName,
              firstName: parsed.firstName,
              lastName: parsed.lastName,
              assignedName,
              passwordHash: tempHash,
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
    if (!user) continue;

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
    const sent = await sendInviteEmail({ to: email, inviteUrl, realName: parsed.realName });
    inviteLinks.push({ email, inviteUrl, sent });
  }

  await logAdminAction(session.user.id, "students.import", {
    imported: inviteLinks.length
  });

  emitAdminUpdate({ type: "students", action: "import", count: inviteLinks.length });

  return NextResponse.json({ invites: inviteLinks });
}
