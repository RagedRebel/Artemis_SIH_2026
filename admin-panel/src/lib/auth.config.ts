import type { NextAuthConfig } from 'next-auth'
import { NextResponse } from 'next/server'
import { getAuthSecret } from '@/lib/auth-secret'

/**
 * Edge-safe slice of Auth.js config (no MongoDB / bcrypt / Node-only imports).
 * Used by `middleware.ts`. Full providers + DB live in `lib/auth.ts`.
 */
export const authConfig = {
  secret: getAuthSecret(),
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  providers: [],
  callbacks: {
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl

      if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        /\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?)$/i.test(pathname)
      ) {
        return true
      }

      if (pathname.startsWith('/api/')) {
        if (
          pathname.startsWith('/api/auth') ||
          pathname.startsWith('/api/setup') ||
          pathname.startsWith('/api/alerts-webhook') ||
          pathname.startsWith('/api/integrations/jira/webhook') ||
          pathname.startsWith('/api/integrations/slack/interactive')
        ) {
          return true
        }
        if (!auth?.user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return true
      }

      if (pathname === '/login' || pathname === '/setup') {
        if (auth?.user) {
          return NextResponse.redirect(new URL('/dashboard', request.nextUrl))
        }
        return true
      }

      return !!auth?.user
    },
  },
} satisfies NextAuthConfig
