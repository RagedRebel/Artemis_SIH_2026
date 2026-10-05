import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PATCH(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    const { name, image } = body

    if (!name || typeof name !== 'string') {
      return new NextResponse('Invalid name', { status: 400 })
    }

    // Basic size validation for the base64 string
    // A 500kb image in base64 will be approx 33% larger -> roughly 670KB max string length.
    if (image && typeof image === 'string' && image.length > 700_000) {
      return new NextResponse('Image too large (max ~500KB)', { status: 400 })
    }

    await db.query(
      `UPDATE users 
       SET name = $1, image_url = $2 
       WHERE id = $3`,
      [name.trim(), image || null, session.user.id]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Profile update error:', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
}
