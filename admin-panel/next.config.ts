import type { NextConfig } from 'next'
import { loadMonorepoEnv } from './src/lib/monorepo-env'

// Pull repo-root `.env` into `process.env` before Next reads config (AUTH_SECRET, MONGODB_URI, …).
loadMonorepoEnv()

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
