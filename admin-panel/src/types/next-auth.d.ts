export type AppUserRole = 'admin' | 'analyst' | 'readonly' | 'pentester'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role?: AppUserRole
    }
  }

  interface User {
    id?: string
    role?: AppUserRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: AppUserRole
  }
}
