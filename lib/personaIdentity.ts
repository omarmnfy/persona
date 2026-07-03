import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { PERSONA_NAME_POOL } from "@/lib/personaCatalog";

type TxClient = Prisma.TransactionClient;

function randomIndex(max: number) {
  return crypto.randomInt(0, max);
}

export async function generateAssignedName(tx: TxClient, excludeUserId?: string) {
  const usedRows = await tx.user.findMany({
    where: {
      assignedName: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {})
    },
    select: { assignedName: true }
  });
  const used = new Set(
    usedRows
      .map((row) => row.assignedName?.trim())
      .filter((value): value is string => Boolean(value))
  );

  const available = PERSONA_NAME_POOL.filter((name) => !used.has(name));
  if (available.length > 0) {
    return available[randomIndex(available.length)];
  }

  const baseName = PERSONA_NAME_POOL[randomIndex(PERSONA_NAME_POOL.length)];
  let suffix = 2;
  let candidate = `${baseName} ${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${baseName} ${suffix}`;
  }
  return candidate;
}
