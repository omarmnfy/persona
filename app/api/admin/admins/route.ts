import { NextRequest, NextResponse } from "next/server";
import { AccountType } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf, hashPassword } from "@/lib/auth";
import { getOnlineUserIds } from "@/server/presenceStore";
import { generateInviteToken, hashInviteToken } from "@/lib/invite";
import { sendInviteEmail } from "@/lib/mailer";
import { logAdminAction } from "@/lib/audit";
import { emitAdminUpdate } from "@/server/events";
import { parseFullName } from "@/lib/personaCatalog";

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admins = await prisma.user.findMany({
    where: { accountType: { in: [AccountType.ADMIN, AccountType.SUPER_ADMIN] } },
    orderBy: { createdAt: "desc" }
  });
  const onlineIds = getOnlineUserIds();

  return NextResponse.json({
    admins: admins.map((admin) => ({
      id: admin.id,
      realName: admin.realName,
      email: admin.email,
      accountType: admin.accountType,
      isActive: admin.isActive,
      lastSeenAt: admin.lastSeenAt,
      isOnline: onlineIds.has(admin.id)
    })),
    currentUserAccountType: session.user.accountType
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
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing && !isAdmin(existing.accountType)) {
    return NextResponse.json({ error: "Email is already used by a student account" }, { status: 409 });
  }
  if (existing?.isActive) {
    return NextResponse.json({ error: "Admin already active" }, { status: 400 });
  }

  const sourceName = (realName ?? existing?.realName ?? "").trim().replace(/\s+/g, " ");
  const nameParts = parseFullName(sourceName);
  if (!nameParts.firstName || !nameParts.lastName) {
    return NextResponse.json({ error: "Please provide first and last name" }, { status: 400 });
  }

  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const tempPassword = crypto.randomBytes(16).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);

  const adminUser = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          accountType: AccountType.ADMIN,
          realName: nameParts.realName,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          school: null,
          assignedName: null,
          isActive: false
        }
      })
    : await prisma.user.create({
        data: {
          email: normalizedEmail,
          accountType: AccountType.ADMIN,
          realName: nameParts.realName,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          school: null,
          assignedName: null,
          passwordHash,
          isActive: false
        }
      });

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);

  await prisma.inviteToken.create({
    data: {
      userId: adminUser.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  const inviteUrl = `${appBaseUrl}/invite/${token}`;
  const sent = await sendInviteEmail({
    to: normalizedEmail,
    inviteUrl,
    realName: nameParts.realName,
    inviteType: "ADMIN"
  });

  await logAdminAction(session.user.id, "admins.invite", {
    email: normalizedEmail,
    realName: nameParts.realName,
    sent
  });
  emitAdminUpdate({ type: "admins", action: "invite", email: normalizedEmail, sent });

  return NextResponse.json({ inviteUrl, sent });
}

export async function DELETE(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const { searchParams } = new URL(request.url);
  const adminId = searchParams.get("id");
  if (!adminId) {
    return NextResponse.json({ error: "Admin ID required" }, { status: 400 });
  }

  if (adminId === session.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: adminId } });
  if (!target || !isAdmin(target.accountType)) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  await prisma.session.deleteMany({ where: { userId: adminId } });
  await prisma.inviteToken.deleteMany({ where: { userId: adminId } });
  await prisma.user.delete({ where: { id: adminId } });

  await logAdminAction(session.user.id, "admins.delete", {
    email: target.email,
    realName: target.realName
  });
  emitAdminUpdate({ type: "admins", action: "delete", email: target.email });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (session.user.accountType !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the super admin can edit admins" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { id, realName, email: newEmail } = body as { id?: string; realName?: string; email?: string };
  if (!id) {
    return NextResponse.json({ error: "Admin ID required" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !isAdmin(target.accountType)) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  const updateData: Record<string, string> = {};
  if (realName?.trim()) {
    const nameParts = parseFullName(realName.trim());
    updateData.realName = nameParts.realName;
    updateData.firstName = nameParts.firstName;
    updateData.lastName = nameParts.lastName;
  }
  if (newEmail?.trim()) {
    const normalizedEmail = newEmail.toLowerCase().trim();
    const existingWithEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingWithEmail && existingWithEmail.id !== id) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    updateData.email = normalizedEmail;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData
  });

  await logAdminAction(session.user.id, "admins.edit", {
    targetId: id,
    changes: updateData
  });
  emitAdminUpdate({ type: "admins", action: "edit", email: updated.email });

  return NextResponse.json({ admin: { id: updated.id, realName: updated.realName, email: updated.email } });
}
