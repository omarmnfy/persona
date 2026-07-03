import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { AccountType } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import { emitAdminUpdate } from "@/server/events";

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await prisma.classConfig.findFirst();
  return NextResponse.json({
    allowAdminPosting: config?.allowAdminPosting ?? false,
    showAdminJoinMessage: config?.showAdminJoinMessage ?? true,
    silentViewReadOnly: config?.silentViewReadOnly ?? true
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
  const { allowAdminPosting, showAdminJoinMessage, silentViewReadOnly } = body as {
    allowAdminPosting?: boolean;
    showAdminJoinMessage?: boolean;
    silentViewReadOnly?: boolean;
  };

  const existing = await prisma.classConfig.findFirst();
  if (existing) {
    await prisma.classConfig.update({
      where: { id: existing.id },
      data: {
        allowAdminPosting: allowAdminPosting ?? existing.allowAdminPosting,
        showAdminJoinMessage: showAdminJoinMessage ?? existing.showAdminJoinMessage,
        silentViewReadOnly: silentViewReadOnly ?? existing.silentViewReadOnly
      }
    });
  } else {
    await prisma.classConfig.create({
      data: {
        allowAdminPosting: Boolean(allowAdminPosting),
        showAdminJoinMessage: showAdminJoinMessage ?? true,
        silentViewReadOnly: silentViewReadOnly ?? true
      }
    });
  }

  emitAdminUpdate({ type: "settings", action: "update" });

  return NextResponse.json({ ok: true });
}
