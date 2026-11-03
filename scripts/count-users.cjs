// Prints the number of users (used by vercel-build.sh to decide whether to seed).
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
prisma.user
  .count()
  .then((n) => process.stdout.write(String(n)))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
