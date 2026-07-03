import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/mailer";

function hashResetToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret";
  return crypto.createHash("sha256").update(token + secret).digest("hex");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email } = body as { email?: string };

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || !user.isActive) {
    return NextResponse.json({ ok: true });
  }

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:5000";
  const resetUrl = `${appBaseUrl}/reset-password/${token}`;

  try {
    await sendPasswordResetEmail({
      to: normalizedEmail,
      resetUrl,
      realName: user.realName,
    });
  } catch (err) {
    console.error("[ForgotPassword] Failed to send reset email:", err);
  }

  return NextResponse.json({ ok: true });
}
