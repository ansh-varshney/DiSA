import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getMyNotifications } from '@/actions/notifications'
import { NotificationsClient } from './notifications-client'

export default async function StudentNotificationsPage() {
    const session = await auth()
    if (!session?.user?.id) redirect('/login')

    const notifications = await getMyNotifications(false, 60)

    return (
        <div className="p-4 md:p-8 space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <NotificationsClient notifications={notifications} />
        </div>
    )
}
