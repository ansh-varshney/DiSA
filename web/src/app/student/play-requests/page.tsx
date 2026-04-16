import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getMyPlayRequests } from '@/actions/notifications'
import { PlayRequestsClient } from './play-requests-client'

export default async function PlayRequestsPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const requests = await getMyPlayRequests()

    return (
        <div className="p-4 md:p-8 space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">Play Requests</h1>
            <p className="text-sm text-gray-500">
                Requests from other students to join their booking.
            </p>
            <PlayRequestsClient requests={requests as any} />
        </div>
    )
}
