import { prisma } from "./db";
import { Role, RoundStatus } from "@prisma/client";
import crypto from "crypto";

function cyrb128(str: string) {
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

function mulberry32(seed: number) {
  let t = seed + 0x6d2b79f5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(array: T[], rng: () => number) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRoomDisplayName(student: { assignedName?: string | null; nickname?: string | null; realName: string }) {
  return student.assignedName ?? student.nickname ?? student.realName;
}

export function generateRoomName(school: string | null | undefined): string {
  if (!school || school === "Other") return "";
  return `Finding Who is Actually From ${school}?`;
}

export function buildAssignments<T extends { id: string; school?: string | null; assignedName?: string | null; nickname?: string | null; realName: string }>(
  students: T[],
  seed?: string | null
) {
  const rng = seed ? mulberry32(cyrb128(seed)[0]) : () => cryptoRandom();
  const shuffled = shuffle(students, rng);

  const groups: T[][] = [];
  for (let i = 0; i < shuffled.length; i += 3) {
    groups.push(shuffled.slice(i, i + 3));
  }

  const fullGroups = groups.filter((group) => group.length === 3);
  const partialGroups = groups.filter((group) => group.length < 3).flat();

  const rooms: T[][] = [];
  const waiting: T[] = [...partialGroups];

  for (const group of fullGroups) {
    const eligible = group.filter((s) => s.school && s.school !== "Other");
    if (eligible.length === 0) {
      waiting.push(...group);
      continue;
    }
    rooms.push(group);
  }

  const roomAssignments = rooms.map((group) => {
    const eligible = group.filter((s) => s.school && s.school !== "Other");
    const shuffledEligible = shuffle(eligible, rng);

    let realStudent: T | null = null;
    let fakeStudent: T | null = null;

    for (const candidate of shuffledEligible) {
      const others = group.filter((s) => s.id !== candidate.id);
      const differentSchool = others.find((s) => s.school !== candidate.school);
      if (differentSchool) {
        realStudent = candidate;
        fakeStudent = differentSchool;
        break;
      }
    }

    if (!realStudent) {
      realStudent = shuffledEligible[0];
    }

    const roles: Role[] = group.map((s) => {
      if (s.id === realStudent!.id) return Role.REAL;
      return Role.WAITING;
    });

    const otherIndices = group.map((_, i) => i).filter((i) => group[i].id !== realStudent!.id);

    if (fakeStudent) {
      otherIndices.forEach((idx) => {
        roles[idx] = group[idx].id === fakeStudent!.id ? Role.FAKE : Role.INTERROGATOR;
      });
    } else {
      const otherRoles = shuffle([Role.FAKE, Role.INTERROGATOR] as Role[], rng);
      otherIndices.forEach((idx, j) => { roles[idx] = otherRoles[j]; });
    }

    const roomName = generateRoomName(realStudent.school);

    return { members: group, roles, roomName };
  });

  return { roomAssignments, waiting };
}

export async function generateAssignments(roundId: string, seed?: string | null) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new Error("Round not found");

  const lastRound = await prisma.round.findFirst({
    where: { roundNumber: { lt: round.roundNumber } },
    orderBy: { roundNumber: "desc" }
  });

  const waitingPriorityIds = lastRound
    ? (
        await prisma.roomMembership.findMany({
          where: { roundId: lastRound.id, assignedRole: Role.WAITING },
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

  const { roomAssignments, waiting } = buildAssignments(prioritized, seed);

  const createdRooms = await prisma.$transaction(async (tx) => {
    await tx.roomMembership.deleteMany({ where: { roundId } });
    await tx.room.deleteMany({ where: { roundId } });

    const rooms = await Promise.all(
      roomAssignments.map((ra, index) =>
        tx.room.create({
          data: {
            roundId,
            roomNumber: index + 1,
            name: ra.roomName,
            status: "NOT_STARTED"
          }
        })
      )
    );

    for (let i = 0; i < rooms.length; i++) {
      const group = roomAssignments[i].members;
      const roles = roomAssignments[i].roles;
      await Promise.all(
        group.map((student, idx) =>
          tx.roomMembership.create({
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

    if (waiting.length) {
      await Promise.all(
        waiting.map((student) =>
          tx.roomMembership.create({
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

    return rooms;
  });

  return createdRooms;
}

export async function generateSessionAssignments(sessionId: string) {
  const session = await prisma.discussionSession.findUnique({
    where: { id: sessionId },
    include: { rounds: { orderBy: { roundNumber: "asc" } } }
  });
  if (!session) throw new Error("Session not found");

  const scheduledRounds = session.rounds.filter((r: any) => r.status === "SCHEDULED");
  if (scheduledRounds.length === 0) throw new Error("No scheduled rounds in this session");

  const activeStudents = await prisma.user.findMany({
    where: { accountType: "STUDENT", isActive: true },
    orderBy: { createdAt: "asc" }
  });

  if (activeStudents.length < 3) throw new Error("Need at least 3 active students");

  const rng = () => cryptoRandom();
  const numRooms = Math.floor(activeStudents.length / 3);

  const interrogatorCount: Record<string, number> = {};
  activeStudents.forEach((s) => { interrogatorCount[s.id] = 0; });

  const roundPlans: Array<{
    roundId: string;
    roomAssignments: Array<{ members: typeof activeStudents; roles: Role[]; roomName: string }>;
    waiting: typeof activeStudents;
  }> = [];

  for (const round of scheduledRounds) {
    const sorted = [...activeStudents].sort((a, b) => {
      const diff = interrogatorCount[a.id] - interrogatorCount[b.id];
      if (diff !== 0) return diff;
      return Math.random() - 0.5;
    });

    const interrogators = sorted.slice(0, numRooms);
    const others = sorted.slice(numRooms);
    const shuffledOthers = shuffle(others, rng);

    const fullRoomOthers = shuffledOthers.slice(0, numRooms * 2);
    const waitingStudents = shuffledOthers.slice(numRooms * 2);

    const roomAssignments: Array<{ members: typeof activeStudents; roles: Role[]; roomName: string }> = [];
    const extraWaiting: typeof activeStudents = [];

    for (let i = 0; i < interrogators.length; i++) {
      const interrogator = interrogators[i];
      const partner1 = fullRoomOthers[i * 2];
      const partner2 = fullRoomOthers[i * 2 + 1];
      const partners = [partner1, partner2];

      const eligibleForReal = partners.filter((p) => p.school && p.school !== "Other");

      if (eligibleForReal.length === 0) {
        extraWaiting.push(interrogator, ...partners);
        continue;
      }

      let realStudent: typeof activeStudents[0] | null = null;
      let fakeStudent: typeof activeStudents[0] | null = null;

      const shuffledEligibleForReal = shuffle(eligibleForReal, rng);
      for (const candidate of shuffledEligibleForReal) {
        const other = partners.find((p) => p.id !== candidate.id);
        if (other && other.school !== candidate.school) {
          realStudent = candidate;
          fakeStudent = other;
          break;
        }
      }

      if (!realStudent) {
        realStudent = shuffledEligibleForReal[0];
        fakeStudent = partners.find((p) => p.id !== realStudent!.id)!;
      }

      if (!fakeStudent) {
        extraWaiting.push(interrogator, ...partners);
        continue;
      }

      const roomName = generateRoomName(realStudent.school);

      roomAssignments.push({
        members: [interrogator, realStudent, fakeStudent],
        roles: [Role.INTERROGATOR, Role.REAL, Role.FAKE] as Role[],
        roomName
      });
      interrogatorCount[interrogator.id]++;
    }

    roundPlans.push({ roundId: round.id, roomAssignments, waiting: [...waitingStudents, ...extraWaiting] });
  }

  await prisma.$transaction(async (tx) => {
    for (const plan of roundPlans) {
      await tx.roomMembership.deleteMany({ where: { roundId: plan.roundId } });
      await tx.room.deleteMany({ where: { roundId: plan.roundId } });

      const rooms = await Promise.all(
        plan.roomAssignments.map((ra, index) =>
          tx.room.create({
            data: {
              roundId: plan.roundId,
              roomNumber: index + 1,
              name: ra.roomName,
              status: "NOT_STARTED"
            }
          })
        )
      );

      for (let i = 0; i < rooms.length; i++) {
        const group = plan.roomAssignments[i].members;
        const roles = plan.roomAssignments[i].roles;
        await Promise.all(
          group.map((student, idx) =>
            tx.roomMembership.create({
              data: {
                roundId: plan.roundId,
                roomId: rooms[i].id,
                userId: student.id,
                assignedRole: roles[idx],
                nicknameUsed: getRoomDisplayName(student)
              }
            })
          )
        );
      }

      if (plan.waiting.length) {
        await Promise.all(
          plan.waiting.map((student) =>
            tx.roomMembership.create({
              data: {
                roundId: plan.roundId,
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
  });

  return { roundCount: roundPlans.length };
}

function cryptoRandom() {
  const bytes = crypto.randomBytes(4);
  const value = bytes.readUInt32BE(0);
  return value / 0xffffffff;
}

export async function ensureRoundActive(roundId: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round || round.status !== RoundStatus.ACTIVE) return null;
  return round;
}
