import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clearSessionCookies, hashToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const adminToken = request.cookies.get("session_admin")?.value;
  const studentToken = request.cookies.get("session_student")?.value;
  const tokens = [adminToken, studentToken].filter(Boolean) as string[];
  if (tokens.length) {
    await prisma.session.deleteMany({ where: { tokenHash: { in: tokens.map(hashToken) } } });
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
