import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from '@/lib/auth.config'
import { getAuthSecret } from '@/lib/auth-secret'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export type UserRole = 'admin' | 'analyst' | 'readonly' | 'pentester'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: getAuthSecret(),
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const username = typeof credentials?.username === 'string' ? credentials.username.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        
        if (!username || !password) return null

        try {
          const result = await db.query('SELECT * FROM users WHERE username = $1', [username])
          const user = result.rows[0]
          
          if (!user) return null

          const isValid = await bcrypt.compare(password, user.password_hash)
          if (!isValid) return null

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            image: user.image_url,
            username: user.username,
          }
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.role = (user as { role: UserRole }).role
        token.email = user.email ?? undefined
        token.name = user.name ?? undefined
        token.picture = user.image ?? undefined
        token.username = (user as any).username ?? undefined
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ''
        session.user.role = token.role as UserRole
        session.user.email = token.email ?? session.user.email
        session.user.name = token.name ?? session.user.name
        session.user.image = token.picture ?? session.user.image
        ;(session.user as any).username = token.username
      }
      return session
    },
  },
})
