import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { signOut } from '@/actions/auth'

export default async function Dashboard() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/')
    }

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
            <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
                <h2 className="text-lg font-semibold mb-2">User Session</h2>
                <p className="text-gray-600">Email/Phone: {user.email || user.phone}</p>
                <p className="text-gray-600">User ID: {user.id}</p>
                <p className="text-gray-600">Last Sign In: {user.last_sign_in_at}</p>
            </div>

            <form action={signOut}>
                <Button type="submit" variant="destructive">
                    Sign Out
                </Button>
            </form>
        </div>
    )
}
