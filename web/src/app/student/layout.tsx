import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { StudentNav } from '@/components/student-nav'
import { ProfileCompletionModal } from '@/components/profile-completion-modal'
import { NotificationPopup } from '@/components/notification-popup'
import { getMyNotifications } from '@/actions/notifications'

export default async function StudentLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/login')
    }

    // 2. Role check
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch, gender')
        .eq('id', user.id)
        .single()

    if (profile && profile.role !== 'student' && profile.role !== 'superuser') {
        redirect('/')
    }

    // 3. If student is missing branch or gender, show the completion modal overlay.
    //    The modal is rendered on top of children — no redirect loop possible.
    const needsCompletion =
        profile?.role === 'student' &&
        (!profile?.branch || !profile?.gender)

    // Fetch unread notifications to seed the popup (play requests excluded — they have their own page)
    const initialNotifications = await getMyNotifications(true, 10)

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 md:pl-64">
            {needsCompletion && <ProfileCompletionModal />}
            <NotificationPopup initial={initialNotifications} />
            {children}
            <StudentNav />
        </div>
    )
}
