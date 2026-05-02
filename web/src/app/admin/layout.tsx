import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { AdminNav } from '@/components/admin-nav'
import { NotificationPopup } from '@/components/notification-popup'
import { getMyNotifications } from '@/actions/notifications'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await auth()
    if (!session?.user?.id) redirect('/login?role=admin')

    const [profile] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, session.user.id))
        .limit(1)

    if (profile && profile.role !== 'admin' && profile.role !== 'superuser') {
        redirect('/')
    }

    const initialNotifications = await getMyNotifications(true, 10)

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 md:pl-64">
            <NotificationPopup initial={initialNotifications} />
            {children}
            <AdminNav />
        </div>
    )
}
