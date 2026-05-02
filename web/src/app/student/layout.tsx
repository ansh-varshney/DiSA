import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { StudentNav } from '@/components/student-nav'
import { ProfileCompletionModal } from '@/components/profile-completion-modal'
import { NotificationPopup } from '@/components/notification-popup'
import { getMyNotifications } from '@/actions/notifications'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
    const session = await auth()
    if (!session?.user?.id) redirect('/login')

    const [profile] = await db
        .select({
            role: profiles.role,
            branch: profiles.branch,
            gender: profiles.gender,
            phone_number: profiles.phone_number,
        })
        .from(profiles)
        .where(eq(profiles.id, session.user.id))
        .limit(1)

    if (profile && profile.role !== 'student' && profile.role !== 'superuser') {
        redirect('/')
    }

    const needsCompletion =
        profile?.role === 'student' &&
        (!profile?.branch || !profile?.gender || !profile?.phone_number)

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
