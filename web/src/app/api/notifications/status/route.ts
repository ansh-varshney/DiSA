import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { notifications } from '@/db/schema'
import { and, eq, inArray } from 'drizzle-orm'

export async function GET(request: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json([], { status: 401 })

    const idsParam = request.nextUrl.searchParams.get('ids')
    if (!idsParam) return NextResponse.json([])

    const ids = idsParam.split(',').filter(Boolean).slice(0, 20)
    if (ids.length === 0) return NextResponse.json([])

    const rows = await db
        .select({ id: notifications.id, is_read: notifications.is_read })
        .from(notifications)
        .where(
            and(
                eq(notifications.recipient_id, session.user.id),
                inArray(notifications.id, ids)
            )
        )

    return NextResponse.json(rows)
}
