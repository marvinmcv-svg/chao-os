import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 12);

  const existing = await prisma.user.findUnique({
    where: { email: 'reixander123@chaoarquitectura.bo' },
  });

  if (existing) {
    console.log('⚠️  User already exists:', existing.email);
    return;
  }

  const user = await prisma.user.create({
    data: {
      name: 'Reixander123',
      email: 'reixander123@chaoarquitectura.bo',
      passwordHash,
      role: UserRole.ADMIN,
      avatarInitials: 'RX',
      capacityPercent: 100,
    },
  });

  console.log('✅ User created:', user.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
