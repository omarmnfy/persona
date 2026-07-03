import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/authz";
import { getVisibleAdmins } from "@/server/presenceStore";

function formatAdminDisplayName(realName: string, assignedName: string) {
  if (!assignedName || assignedName === realName) return realName;
  return `${realName} (${assignedName})`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");
  const { session, response } = await requireUser(
    request,
    role === "ADMIN" || role === "STUDENT" ? role : undefined
  );
  if (response) return response;

  const { roomId } = await params;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const userIsAdmin = isAdmin(session.user.accountType);
  if (!userIsAdmin) {
    const membership = await prisma.roomMembership.findFirst({
      where: { roomId, userId: session.user.id, round: { status: "ACTIVE" } }
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const participants = await prisma.roomMembership.findMany({
    where: { roomId },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });

  const visibleAdmins = getVisibleAdmins(roomId);

  return NextResponse.json({
    participants: participants
      .map((m) => {
        const assignedName = m.nicknameUsed || m.user.assignedName || m.user.realName;
        return {
          userId: m.userId,
          displayName:
            userIsAdmin
              ? formatAdminDisplayName(m.user.realName, assignedName)
              : assignedName,
          realName: userIsAdmin ? m.user.realName : undefined,
          role: userIsAdmin ? m.assignedRole : undefined,
          isAdmin: false
        };
      })
      .concat(
        visibleAdmins.map((admin) => ({
          userId: admin.userId,
          displayName: admin.displayName,
          realName: userIsAdmin ? admin.displayName : undefined,
          role: undefined,
          isAdmin: true
        }))
      )
  });
}
