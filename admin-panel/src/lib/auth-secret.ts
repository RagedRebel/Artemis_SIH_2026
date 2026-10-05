/**
 * Shared secret for Auth.js and middleware JWT verification.
 * Never returns empty/undefined so NextAuth does not throw MissingSecret.
 */
let warnedMissingSecret = false

export function getAuthSecret(): string {
  const raw = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').trim()
  if (raw.length > 0) return raw

  if (process.env.NODE_ENV === 'production' && !warnedMissingSecret) {
    warnedMissingSecret = true
    console.warn(
      '[auth] AUTH_SECRET and NEXTAUTH_SECRET are unset or blank. Using a built-in fallback — set AUTH_SECRET in production.'
    )
  }

  return 'artemis-dev-auth-secret-do-not-use-in-production'
}
