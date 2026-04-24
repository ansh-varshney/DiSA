import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getMyNotifications } from '@/actions/notifications'
import { AdminNotificationsClient } from './admin-notifications-client'

export default async function AdminNotificationsPage() {
    const session = await auth()
    if (!session?.user?.id) redirect('/login?role=admin')

    const notifications = await getMyNotifications(false, 80)

    return (
        <div className="p-4 md:p-8 space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <AdminNotificationsClient notifications={notifications} />
        </div>
    )
}
