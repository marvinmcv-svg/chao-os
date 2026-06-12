import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

/**
 * User shape returned to NextAuth's `authorize` callback. Kept narrow on
 * purpose: only fields the session actually needs.
 */
export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  avatarInitials: string
  teamMember?: {
    id: string
    role: string
    weeklyHoursCapacity: number
    utilizationPercent: number
  }
}

/**
 * Standalone credentials authorizer — extracted so it can be unit-tested
 * without spinning up the full NextAuth middleware / Edge runtime.
 * Returns the user object (shape consumed by NextAuth) or `null` on failure.
 *
 * Both "user not found" and "wrong password" return null to prevent
 * user-enumeration attacks (see OWASP A07:2021).
 */
export async function authorizeCredentials(
  email: string,
  password: string
): Promise<AuthUser | null> {
  if (!email || !password) return null

  const user = await prisma.user.findUnique({
    where: { email },
    include: { teamMember: true },
  })

  if (!user) return null

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    // Prisma's avatarInitials is nullable; NextAuth's User expects string.
    avatarInitials: user.avatarInitials ?? '',
    ...(user.teamMember && {
      teamMember: {
        id: user.teamMember.id,
        role: user.teamMember.role,
        weeklyHoursCapacity: user.teamMember.weeklyHoursCapacity,
        utilizationPercent: user.teamMember.utilizationPercent,
      },
    }),
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        return authorizeCredentials(
          credentials.email as string,
          credentials.password as string
        )
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.avatarInitials = (user as any).avatarInitials
        token.teamMember = (user as any).teamMember
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.avatarInitials = token.avatarInitials as string
        session.user.teamMember = token.teamMember as any
      }
      return session
    },
  },
  cookies: {
    sessionToken: {
      name: 'chao-session',
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
  },
})