import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { AccountType } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import { generateInviteToken, hashInviteToken } from "@/lib/invite";
import { logAdminAction } from "@/lib/audit";
import { sendInviteEmail } from "@/lib/mailer";
import { emitAdminUpdate } from "@/server/events";

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { email } = body as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.accountType !== AccountType.STUDENT) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  if (user.isActive) {
    return NextResponse.json({ error: "Student already active" }, { status: 400 });
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

  await logAdminAction(session.user.id, "invites.resend", { email: user.email });

  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const inviteUrl = `${appBaseUrl}/invite/${token}`;
  const sent = await sendInviteEmail({ to: user.email, inviteUrl, realName: user.realName });
  emitAdminUpdate({ type: "students", action: "invite", email: user.email, sent });
  return NextResponse.json({ inviteUrl, sent });
}
