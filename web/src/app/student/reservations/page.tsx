import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getStudentBookings } from '@/actions/bookings'
import { ReservationsList } from '@/components/reservations-list'

export default async function ReservationsPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { current, upcoming, past } = await getStudentBookings(user.id)

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold text-gray-900">My Reservations</h1>
                <p className="text-sm text-gray-500">Track your bookings and active sessions</p>
            </div>

            <ReservationsList current={current} upcoming={upcoming} past={past} userId={user.id} />
        </div>
    )
}
