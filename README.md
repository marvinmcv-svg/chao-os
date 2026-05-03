# CHAO OS — CRM & Operating System for Architecture Firms

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** NextAuth.js v5 (Auth.js)
- **State:** Zustand + TanStack Query
- **Styling:** Tailwind CSS
- **Validation:** Zod + React Hook Form
- **Email:** Resend
- **Storage:** AWS S3 / Cloudflare R2

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Start development server
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript check |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to DB |
| `npm run db:seed` | Seed database |
| `npm run db:studio` | Open Prisma Studio |

---

*For CHAO Arquitectura S.R.L. — Santa Cruz de la Sierra, Bolivia*
