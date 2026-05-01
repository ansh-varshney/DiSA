'use server'

import { db } from '@/db'
import { courts } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth-guards'

export async function getCourts() {
    try {
        return await db.select().from(courts).orderBy(asc(courts.name))
    } catch {
        return []
    }
}

export async function getActiveCourts() {
    try {
        return await db
            .select()
            .from(courts)
            .where(eq(courts.is_active, true))
            .orderBy(asc(courts.name))
    } catch {
        return []
    }
}

export async function createCourt(formData: FormData) {
    await requireAdmin()
    const name = formData.get('name') as string
    const sport = formData.get('sport') as string
    const type = formData.get('type') as string
    const capacity = Number(formData.get('capacity')) || 4

    try {
        await db.insert(courts).values({ name, sport, type, capacity })
    } catch (e: any) {
        return { error: e?.message ?? 'Failed to create court' }
    }

    revalidatePath('/admin/courts')
    return { success: true }
}
