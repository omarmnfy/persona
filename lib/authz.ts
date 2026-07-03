import { prisma } from "./db";
import { AccountType, RoundStatus } from "@prisma/client";

export function isAdmin(accountType: AccountType) {
  return accountType === "ADMIN" || accountType === "SUPER_ADMIN";
}

export function isSuperAdmin(accountType: AccountType) {
  return accountType === "SUPER_ADMIN";
}

export async function requireAdminUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !isAdmin(user.accountType)) return null;
  return user;
}

export async function getActiveRound() {
  return prisma.round.findFirst({
    where: { status: RoundStatus.ACTIVE },
    orderBy: { startsAt: "desc" }
  });
}

export async function canAccessRoom(userId: string, roomId: string) {
  const membership = await prisma.roomMembership.findFirst({
    where: {
      userId,
      roomId,
      round: { status: RoundStatus.ACTIVE }
    },
    include: { round: true }
  });
  return membership ?? null;
}
