import fs from 'fs'
import path from 'path'
import { loadEnvConfig } from '@next/env'

let loaded = false

/**
 * Merge `.env` from the monorepo root and this app so hoisted vars (e.g. `REDIS_URL`,
 * `DATABASE_URL`) are visible even when `admin-panel/.env` exists alone.
 * Later files override earlier keys (admin-panel wins over repo root).
 */
export function loadMonorepoEnv(): void {
  if (loaded) return

  const repoRoot = path.resolve(__dirname, '..', '..')
  const adminRoot = path.resolve(__dirname, '..')
  const cwd = process.cwd()

  const candidates = [repoRoot, adminRoot, cwd, path.resolve(cwd, '..')]
  const seen = new Set<string>()
  const dirs: string[] = []

  for (const dir of candidates) {
    const n = path.normalize(dir)
    if (seen.has(n)) continue
    seen.add(n)
    if (fs.existsSync(path.join(n, '.env'))) dirs.push(n)
  }

  for (const dir of dirs) {
    try {
      loadEnvConfig(dir)
    } catch {
      /* ignore */
    }
  }

  loaded = true
}
