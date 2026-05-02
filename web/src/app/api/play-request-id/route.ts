import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { playRequests } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const bookingId = req.nextUrl.searchParams.get('booking_id')
    if (!bookingId) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })

    const [pr] = await db
        .select({ id: playRequests.id })
        .from(playRequests)
        .where(
            and(
                eq(playRequests.booking_id, bookingId),
                eq(playRequests.recipient_id, session.user.id),
                eq(playRequests.status, 'pending')
            )
        )
        .limit(1)

    if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ play_request_id: pr.id })
}
