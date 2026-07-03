import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");
  const session = await getSessionFromRequest(
    request,
    role === "ADMIN" || role === "STUDENT" ? role : undefined
  );
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      realName: session.user.realName,
      assignedName: session.user.assignedName,
      nickname: session.user.nickname,
      school: session.user.school,
      accountType: session.user.accountType
    },
    csrfToken: session.csrfToken
  });
}
