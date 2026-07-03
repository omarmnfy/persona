import { PrismaClient, AccountType } from "@prisma/client";

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = "omarmnfy@gmail.com";

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL }
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        email: SUPER_ADMIN_EMAIL,
        passwordHash: "__UNCLAIMED__",
        accountType: AccountType.SUPER_ADMIN,
        realName: "Super Admin",
        isActive: false
      }
    });
    console.log(`Super admin account created for ${SUPER_ADMIN_EMAIL} (unclaimed)`);
  } else {
    if (existing.accountType !== AccountType.SUPER_ADMIN) {
      await prisma.user.update({
        where: { email: SUPER_ADMIN_EMAIL },
        data: { accountType: AccountType.SUPER_ADMIN }
      });
      console.log(`Upgraded ${SUPER_ADMIN_EMAIL} to SUPER_ADMIN`);
    } else {
      console.log(`Super admin ${SUPER_ADMIN_EMAIL} already exists`);
    }
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
    console.log("Created default class config");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
