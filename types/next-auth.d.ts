import { DefaultSession, DefaultJWT } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      avatarInitials: string
      teamMember?: {
        id: string
        role: string
        weeklyHoursCapacity: number
        utilizationPercent: number
      }
    } & DefaultSession['user']
  }

  interface User {
    role: string
    avatarInitials: string
    teamMember?: {
      id: string
      role: string
      weeklyHoursCapacity: number
      utilizationPercent: number
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    role: string
    avatarInitials: string
    teamMember?: {
      id: string
      role: string
      weeklyHoursCapacity: number
      utilizationPercent: number
    }
  }
}