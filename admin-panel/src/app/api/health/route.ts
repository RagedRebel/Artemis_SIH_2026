import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'artemis-admin-panel',
    timestamp: new Date().toISOString(),
  })
}
