import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { notifications } from '@/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json([], { status: 401 })
    }

    const since = request.nextUrl.searchParams.get('since') ?? new Date().toISOString()

    const data = await db
        .select()
        .from(notifications)
        .where(
            and(
                eq(notifications.recipient_id, session.user.id),
                eq(notifications.is_read, false),
                gt(notifications.created_at, new Date(since))
            )
        )
        .orderBy(desc(notifications.created_at))
        .limit(10)

    return NextResponse.json(data)
}
