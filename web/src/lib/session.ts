import { auth } from '@/auth'

export type SessionUser = { id: string; email?: string }

export async function getCurrentUser(): Promise<SessionUser | null> {
    const session = await auth()
    if (!session?.user?.id) return null
    return { id: session.user.id, email: session.user.email ?? undefined }
}
