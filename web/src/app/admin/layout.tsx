import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { AdminNav } from '@/components/admin-nav'
import { NotificationPopup } from '@/components/notification-popup'
import { getMyNotifications } from '@/actions/notifications'

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    // Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/login?role=admin')
    }

    // Role Check - Strictly admin only
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile && profile.role !== 'admin' && profile.role !== 'superuser') {
        console.log('Unauthorized access to admin area by:', profile.role)
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
