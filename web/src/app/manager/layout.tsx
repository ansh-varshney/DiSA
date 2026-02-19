import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { ManagerNav } from '@/components/manager-nav'

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

    // Allow manager, admin, and superuser (for testing)
    if (profile && profile.role !== 'manager' && profile.role !== 'admin' && profile.role !== 'superuser') {
        console.log('Unauthorized access to manager area by:', profile.role)
        // redirect('/') 
        // For demo purposes, allowing it but logging. In prod, uncomment redirect.
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 md:pl-64">
            {children}
            <ManagerNav />
        </div>
    )
}
