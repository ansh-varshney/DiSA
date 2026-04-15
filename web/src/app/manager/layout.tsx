import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { ManagerNav } from '@/components/manager-nav'
import { NotificationPopup } from '@/components/notification-popup'
import { getMyNotifications } from '@/actions/notifications'


export default async function ManagerLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/login?role=manager')
    }

    // Role Check
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile && profile.role !== 'manager' && profile.role !== 'admin' && profile.role !== 'superuser') {
        redirect('/')
    }

    const initialNotifications = await getMyNotifications(true, 10)

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 md:pl-64">
            <NotificationPopup initial={initialNotifications} />
            {children}
            <ManagerNav />
        </div>
    )
}
