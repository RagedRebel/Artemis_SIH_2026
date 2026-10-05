import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { needsSetup } from '@/lib/setup'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const isFirstRun = await needsSetup()
    if (!isFirstRun) {
      return NextResponse.json({ error: 'Setup has already been completed' }, { status: 403 })
    }

    const body = await req.json()
    const { username, email, password, name, image } = body

    if (!username || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password, salt)

    await db.query(
      `INSERT INTO users (username, email, password_hash, name, role, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [username.toLowerCase().trim(), email?.trim() || null, hash, name.trim(), 'admin', image || null]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
