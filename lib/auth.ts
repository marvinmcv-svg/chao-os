import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email as string
        const password = credentials.password as string

        const user = await prisma.user.findUnique({
          where: { email },
          include: { teamMember: true },
        })

        if (!user) {
          return null // Same message for both "user not found" and "wrong password"
        }

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarInitials: user.avatarInitials,
          // Include teamMember data if available
          ...(user.teamMember && {
            teamMember: {
              id: user.teamMember.id,
              role: user.teamMember.role,
              weeklyHoursCapacity: user.teamMember.weeklyHoursCapacity,
              utilizationPercent: user.teamMember.utilizationPercent,
            },
          }),
        }
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