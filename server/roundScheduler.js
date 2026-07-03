import { PrismaClient, Role, RoundStatus } from "@prisma/client";
import crypto from "crypto";
import { emitRoundUpdate } from "./events.js";


const prisma = new PrismaClient();
const timers = new Map();

function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0];
}

function mulberry32(seed) {
  let t = seed + 0x6d2b79f5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, rng) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cryptoRandom() {
  const bytes = crypto.randomBytes(4);
  const value = bytes.readUInt32BE(0);
  return value / 0xffffffff;
}

function getRoomDisplayName(student) {
  return student.assignedName ?? student.nickname ?? student.realName;
}

async function generateAssignments(roundId, seed, previousRoundId) {
  const waitingPriorityIds = previousRoundId
    ? (
        await prisma.roomMembership.findMany({
          where: { roundId: previousRoundId, assignedRole: Role.WAITING },
          select: { userId: true }
        })
      ).map((m) => m.userId)
    : [];

  const activeStudents = await prisma.user.findMany({
    where: { accountType: "STUDENT", isActive: true },
    orderBy: { createdAt: "asc" }
  });

  const waitingSet = new Set(waitingPriorityIds);
  const prioritized = activeStudents
    .filter((u) => waitingSet.has(u.id))
    .concat(activeStudents.filter((u) => !waitingSet.has(u.id)));

  const rng = seed ? mulberry32(cyrb128(seed)[0]) : () => cryptoRandom();
  const shuffled = shuffle(prioritized, rng);

  const groups = [];
  for (let i = 0; i < shuffled.length; i += 3) {
    groups.push(shuffled.slice(i, i + 3));
  }

  const roomsToCreate = groups.filter((group) => group.length === 3);
  const waitingMembers = groups.filter((group) => group.length < 3).flat();

  await prisma.roomMembership.deleteMany({ where: { roundId } });
  await prisma.room.deleteMany({ where: { roundId } });

  const rooms = await Promise.all(
    roomsToCreate.map((_, index) =>
      prisma.room.create({
        data: {
          roundId,
          roomNumber: index + 1,
          status: "NOT_STARTED"
        }
      })
    )
  );

  const roleOptions = [Role.REAL, Role.FAKE, Role.INTERROGATOR];
  for (let i = 0; i < rooms.length; i++) {
    const group = roomsToCreate[i];
    const roles = shuffle(roleOptions, rng);
    await Promise.all(
      group.map((student, idx) =>
        prisma.roomMembership.create({
          data: {
            roundId,
            roomId: rooms[i].id,
            userId: student.id,
            assignedRole: roles[idx],
            nicknameUsed: getRoomDisplayName(student)
          }
        })
      )
    );
  }

  if (waitingMembers.length) {
    await Promise.all(
      waitingMembers.map((student) =>
        prisma.roomMembership.create({
          data: {
            roundId,
            roomId: null,
            userId: student.id,
            assignedRole: Role.WAITING,
            nicknameUsed: getRoomDisplayName(student)
          }
        })
      )
    );
  }
}

async function startRound(round) {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + round.durationSeconds * 1000);

  await prisma.round.update({
    where: { id: round.id },
    data: { status: RoundStatus.ACTIVE, startsAt, endsAt, assignmentsLocked: true }
  });

  await prisma.room.updateMany({ where: { roundId: round.id }, data: { status: "ACTIVE" } });

  emitRoundUpdate({ type: "rounds", action: "start", roundId: round.id });
  scheduleRoundEnd(round.id, endsAt);
}

async function endRound(roundId) {
  console.log("[RoundScheduler] endRound called for:", roundId);
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) {
    console.log("[RoundScheduler] Round not found, skipping:", roundId);
    return;
  }
  if (round.status === RoundStatus.ENDED) {
    console.log("[RoundScheduler] Round already ended, skipping:", roundId);
    return;
  }

  await prisma.round.update({
    where: { id: roundId },
    data: { status: RoundStatus.ENDED, endsAt: new Date() }
  });

  await prisma.room.updateMany({ where: { roundId }, data: { status: "ENDED" } });

  emitRoundUpdate({ type: "rounds", action: "end", roundId });
}

function scheduleRoundEnd(roundId, endsAt) {
  if (timers.has(roundId)) {
    clearTimeout(timers.get(roundId));
  }
  const delay = Math.max(0, endsAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    endRound(roundId).catch((error) => console.error("Auto end round failed", error));
  }, delay);
  timers.set(roundId, timer);
}

export async function scheduleExistingRounds() {
  const activeRound = await prisma.round.findFirst({ where: { status: RoundStatus.ACTIVE } });
  if (!activeRound || !activeRound.endsAt) return;
  const endsAt = new Date(activeRound.endsAt);
  if (endsAt.getTime() <= Date.now()) {
    await endRound(activeRound.id);
    return;
  }
  scheduleRoundEnd(activeRound.id, endsAt);
}
