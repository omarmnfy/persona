import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { generateJoinCode, hashJoinCode } from "@/lib/joinCode";
import { AccountType } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import { logAdminAction } from "@/lib/audit";
import { emitAdminUpdate } from "@/server/events";

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const code = generateJoinCode();
  const hash = hashJoinCode(code);
  const existing = await prisma.classConfig.findFirst();
  if (existing) {
    await prisma.classConfig.update({
      where: { id: existing.id },
      data: {
        joinCodeHash: hash,
        joinCodeCreatedAt: new Date()
      }
    });
  } else {
    await prisma.classConfig.create({
      data: {
        joinCodeHash: hash,
        joinCodeCreatedAt: new Date()
      }
    });
  }

  await logAdminAction(session.user.id, "joinCode.generate", { generatedAt: new Date().toISOString() });
  emitAdminUpdate({ type: "joinCode", action: "generate" });

  return NextResponse.json({ joinCode: code });
}

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await prisma.classConfig.findFirst();
  return NextResponse.json({
    hasJoinCode: Boolean(config?.joinCodeHash),
    createdAt: config?.joinCodeCreatedAt ?? null
  });
}
