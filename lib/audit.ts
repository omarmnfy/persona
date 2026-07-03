import { prisma } from "./db";
import { Prisma } from "@prisma/client";

export async function logAdminAction(adminId: string, action: string, payload: Prisma.InputJsonValue) {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      payloadJSON: payload
    }
  });
}
