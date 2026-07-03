import { prisma } from "./db";

const timers = new Map<string, NodeJS.Timeout>();

export async function startRound(roundId: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new Error("Round not found");

  const existingActive = await prisma.round.findFirst({
    where: { status: "ACTIVE" }
  });
  if (existingActive && existingActive.id !== roundId) {
    throw new Error("Another round is already active");
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + round.durationSeconds * 1000);

  const updated = await prisma.round.update({
    where: { id: roundId },
    data: {
      status: "ACTIVE",
      startsAt,
      endsAt,
      assignmentsLocked: true
    }
  });

  await prisma.room.updateMany({
    where: { roundId },
    data: { status: "ACTIVE" }
  });

  scheduleRoundEnd(updated.id, endsAt);
  return updated;
}

export async function endRound(roundId: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new Error("Round not found");

  await prisma.round.update({
    where: { id: roundId },
    data: { status: "ENDED", endsAt: new Date() }
  });

  await prisma.room.updateMany({
    where: { roundId },
    data: { status: "ENDED" }
  });

}

export function scheduleRoundEnd(roundId: string, endsAt: Date) {
  if (timers.has(roundId)) {
    clearTimeout(timers.get(roundId));
  }
  const delay = Math.max(0, endsAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    endRound(roundId).catch((error) => console.error("Auto end round failed", error));
  }, delay);
  timers.set(roundId, timer);
}
