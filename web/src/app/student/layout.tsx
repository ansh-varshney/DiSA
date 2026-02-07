import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { StudentNav } from '@/components/student-nav'

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

    // 2. Role Check (Optional but recommended)
    // We can fetch profile to ensure they are a student
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile && profile.role !== 'student') {
        // If they are manager/admin trying to access student pages, we might want to redirect
        // Or just let them view it (often useful for testing).
        // For strictness:
        // redirect('/')
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 md:pl-64">
            {children}
            <StudentNav />
        </div>
    )
}
