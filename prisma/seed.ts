// prisma/seed.ts
// FIX (BUG 2): Seed uses the correct UserRole enum value 'ADMIN'.
//   Previously this may have referenced 'SUPER_ADMIN' (not in DB enum) or
//   'AGENT' which would cause Prisma to throw a validation error at seed time.
//
// FIX (BUG 4): Seed admin is created with a real bcrypt-hashed password so
//   you can log in immediately via the credentials form after seeding.
//   Change SEED_ADMIN_PASSWORD via the environment before running in production.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Override this via environment variable when seeding a production-like env:
//   SEED_ADMIN_PASSWORD="your-strong-password" npx prisma db seed
const SEED_ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? "admin@complianceai.local";
const SEED_ADMIN_NAME     = process.env.SEED_ADMIN_NAME     ?? "System Administrator";
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin1234!";

async function main() {
  console.log("🌱  Seeding database…");

  // ------------------------------------------------------------------
  // Admin user
  // FIX (BUG 2): role value 'ADMIN' matches the Prisma UserRole enum.
  // FIX (BUG 4): password is properly hashed so credential login works.
  // ------------------------------------------------------------------
  const hashedPassword = await bcrypt.hash(SEED_ADMIN_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {
      // Keep the password up-to-date if re-running the seed.
      password: hashedPassword,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      email: SEED_ADMIN_EMAIL,
      name: SEED_ADMIN_NAME,
      password: hashedPassword,
      // FIX (BUG 2): Must be a value from the Prisma UserRole enum.
      role: "ADMIN",
      isActive: true,
      failedLoginCount: 0, // BUG 1 fix — field now exists in schema.
    },
  });

  console.log(`✅  Admin user ready: ${admin.email}`);

  // ------------------------------------------------------------------
  // Optional: seed a sample user for each role so you can test access
  // controls during development.
  // ------------------------------------------------------------------
  const sampleUsers = [
    { email: "viewer@complianceai.local",     name: "Sample Viewer",     role: "VIEWER"     as const },
    { email: "auditor@complianceai.local",    name: "Sample Auditor",    role: "AUDITOR"    as const },
    { email: "supervisor@complianceai.local", name: "Sample Supervisor", role: "SUPERVISOR" as const },
  ];

  for (const sample of sampleUsers) {
    const pw = await bcrypt.hash("Password123!", 12);
    await prisma.user.upsert({
      where: { email: sample.email },
      update: {},
      create: {
        ...sample,
        password: pw,
        isActive: true,
        failedLoginCount: 0,
      },
    });
    console.log(`✅  Sample user ready: ${sample.email} (${sample.role})`);
  }

  console.log("🌱  Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
