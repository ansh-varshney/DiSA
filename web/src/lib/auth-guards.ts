import { getCurrentUser } from '@/lib/session'
import { db } from '@/db'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function requireAdmin(): Promise<{ id: string }> {
    const user = await getCurrentUser()
    if (!user) throw new Error('Unauthorized: No user logged in')

    const [profile] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, user.id))

    if (!profile || (profile.role !== 'admin' && profile.role !== 'superuser')) {
        throw new Error('Forbidden: Admin access required')
    }

    return { id: user.id }
}

export async function requireManager(): Promise<{ id: string }> {
    const user = await getCurrentUser()
    if (!user) throw new Error('Unauthorized: No user logged in')

    const [profile] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, user.id))

    if (!profile || !['manager', 'admin', 'superuser'].includes(profile.role ?? '')) {
        throw new Error('Forbidden: Manager access required')
    }

    return { id: user.id }
}
