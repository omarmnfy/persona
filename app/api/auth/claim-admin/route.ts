import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AccountType } from "@prisma/client";
import { generateInviteToken, hashInviteToken } from "@/lib/invite";
import { sendInviteEmail } from "@/lib/mailer";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email } = body as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    return NextResponse.json(
      { message: "If a claimable admin account exists for this email, a setup link has been sent." },
      { status: 200 }
    );
  }

  if (user.accountType !== AccountType.SUPER_ADMIN && user.accountType !== AccountType.ADMIN) {
    return NextResponse.json(
      { message: "If a claimable admin account exists for this email, a setup link has been sent." },
      { status: 200 }
    );
  }

  if (user.isActive && user.passwordHash !== "__UNCLAIMED__") {
    return NextResponse.json(
      { message: "This account has already been claimed. Please log in instead." },
      { status: 200 }
    );
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

  const appBaseUrl = process.env.APP_BASE_URL ?? `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost:5000"}`;
  const inviteUrl = `${appBaseUrl}/invite/${token}`;

  const sent = await sendInviteEmail({
    to: user.email,
    inviteUrl,
    realName: user.realName,
    inviteType: "ADMIN"
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Email service is not configured. Please contact the system administrator." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "If a claimable admin account exists for this email, a setup link has been sent."
  });
}
