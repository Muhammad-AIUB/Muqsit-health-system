import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Creates (or updates) the first admin user from env vars.
// Run with: npm run seed
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME ?? 'Muqsit Health System Admin';

  if (!email || !password) {
    console.warn('[seed] ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD not set — skipping admin seed.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'admin', emailVerified: true, approvalStatus: 'approved' },
    create: {
      email,
      name,
      passwordHash,
      role: 'admin',
      emailVerified: true,
      approvalStatus: 'approved',
    },
  });

  console.log(`[seed] Admin user ready: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
