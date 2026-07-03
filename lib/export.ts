import { prisma } from "./db";

function getMessageDisplayName(user: {
  accountType: "ADMIN" | "SUPER_ADMIN" | "STUDENT";
  realName: string;
  assignedName?: string | null;
  nickname?: string | null;
}) {
  if (user.accountType === "ADMIN" || user.accountType === "SUPER_ADMIN") return user.realName;
  return user.assignedName ?? user.nickname ?? user.realName;
}

export async function buildRoundExport(roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      rooms: {
        include: {
          memberships: {
            include: { user: true }
          },
          messages: {
            include: {
              sender: true,
              recipient: true
            },
            orderBy: { createdAt: "asc" }
          }
        },
        orderBy: { roomNumber: "asc" }
      }
    }
  });

  if (!round) return null;

  return {
    roundNumber: round.roundNumber,
    topic: round.topic,
    seed: round.seed,
    durationSeconds: round.durationSeconds,
    startsAt: round.startsAt,
    endsAt: round.endsAt,
    rooms: round.rooms.map((room) => ({
      roomNumber: room.roomNumber,
      roomName: `Room ${room.roomNumber}`,
      participants: room.memberships.map((m) => ({
        userId: m.userId,
        realName: m.user.realName,
        nicknameUsed: m.nicknameUsed,
        assignedRole: m.assignedRole
      })),
      messages: room.messages.map((msg) => ({
        messageId: msg.id,
        type: msg.type,
        createdAt: msg.createdAt,
        sender: msg.sender
          ? {
              id: msg.sender.id,
              displayName: getMessageDisplayName({
                accountType: msg.sender.accountType,
                realName: msg.sender.realName,
                assignedName: msg.sender.assignedName,
                nickname: msg.sender.nickname
              })
            }
          : null,
        recipient: msg.recipient
          ? {
              id: msg.recipient.id,
              displayName: getMessageDisplayName({
                accountType: msg.recipient.accountType,
                realName: msg.recipient.realName,
                assignedName: msg.recipient.assignedName,
                nickname: msg.recipient.nickname
              })
            }
          : null,
        body: msg.body
      }))
    }))
  };
}
