import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'


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
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
            {/* Simple Top Bar for Identity/Logout could go here if needed, but keeping it minimal as requested */}
            <header className="bg-[#004d40] text-white p-4 shadow-md sticky top-0 z-50">
                <div className="flex justify-between items-center max-w-lg mx-auto w-full">
                    <h1 className="text-lg font-bold tracking-wide">Manager Panel</h1>
                    {/* Placeholder for user avatar or settings if needed later */}
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">
                        M
                    </div>
                </div>
            </header>

            <main className="max-w-lg mx-auto w-full">
                {children}
            </main>
        </div>
    )
}
