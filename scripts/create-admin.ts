/**
 * One-time script to create / update an admin user.
 * Run with:  npx ts-node -r tsconfig-paths/register --project tsconfig.json scripts/create-admin.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'robert.grant@selectquote.com';
  // bcrypt hash (12 rounds) of: Gcaa10071007!@!@
  const password =
    '$2a$12$8JW03Yn8xKnVGCwS6zotnuQ81b.3XVwD7Cd44pHcQN51NgF9bZ/G.';

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password,
      role: 'ADMIN',
      isActive: true,
      name: 'Robert Grant',
    },
    create: {
      email,
      password,
      role: 'ADMIN',
      isActive: true,
      name: 'Robert Grant',
    },
  });

  console.log(`✅  Admin user upserted: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
