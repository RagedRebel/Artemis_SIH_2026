import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/** Edge bundle: auth config only (no Mongoose). Matches full `lib/auth.ts` session cookies. */
export default NextAuth(authConfig).auth

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
