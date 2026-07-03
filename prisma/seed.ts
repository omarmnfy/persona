import { PrismaClient, AccountType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@classroom.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const adminHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminHash,
      accountType: AccountType.ADMIN,
      realName: "Admin",
      isActive: true
    }
  });

  const sampleStudents = Array.from({ length: 6 }).map((_, index) => ({
    email: `student${index + 1}@classroom.local`,
    passwordHash: adminHash,
    accountType: AccountType.STUDENT,
    realName: `Student ${index + 1}`,
    firstName: "Student",
    lastName: String(index + 1),
    school: "Harvey Mudd College",
    assignedName: [
      "Alan Turing",
      "Grace Hopper",
      "John von Neumann",
      "Claude Shannon",
      "Donald Knuth",
      "Edsger Dijkstra"
    ][index],
    isActive: true
  }));

  for (const student of sampleStudents) {
    await prisma.user.upsert({
      where: { email: student.email },
      update: {},
      create: student
    });
  }

  const existingConfig = await prisma.classConfig.findFirst();
  if (!existingConfig) {
    await prisma.classConfig.create({
      data: {
        allowAdminPosting: false,
        showAdminJoinMessage: true,
        silentViewReadOnly: true
      }
    });
  }

  console.log(`Seeded admin ${adminEmail} and ${sampleStudents.length} students.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
