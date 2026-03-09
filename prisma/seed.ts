import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash('Admin@1234', 12);

  await prisma.admin.upsert({
    where: { email: 'admin@grandhotel.lk' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'admin@grandhotel.lk',
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log('✅ Admin seeded — email: admin@grandhotel.lk | password: Admin@1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());