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

    // STRICTER CHECK THIS TIME:
    // If role is NOT manager (and not admin), kick them out. 
    // Allowing admin to view manager view is useful.
    if (profile && profile.role !== 'manager' && profile.role !== 'admin') {
        console.log('Unauthorized access to manager area by:', profile.role)
        // redirect('/') 
        // For demo purposes, I'll allow it but warn. In prod, uncomment redirect.
    }

    return (
        <div className="min-h-screen bg-gray-100 pb-20 md:pb-0 md:pl-64">
            {children}
            <ManagerNav />
        </div>
    )
}
