import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getMyNotifications } from '@/actions/notifications'
import { ManagerNotificationsClient } from './manager-notifications-client'

export default async function ManagerNotificationsPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?role=manager')

    const notifications = await getMyNotifications(false, 80)

    return (
        <div className="p-4 md:p-8 space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <ManagerNotificationsClient notifications={notifications} />
        </div>
    )
}
