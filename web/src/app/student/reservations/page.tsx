import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { Badge } from 'lucide-react'

export default async function ReservationsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: bookings } = await supabase
        .from('bookings')
        .select(`
        *,
        courts (name, sport)
    `)
        .eq('user_id', user?.id)
        .order('start_time', { ascending: true })

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold">My Reservations</h1>

            <div className="space-y-4">
                {bookings?.length === 0 && (
                    <p className="text-gray-500">You haven't booked any courts yet.</p>
                )}

                {bookings?.map((booking: any) => (
                    <Card key={booking.id}>
                        <CardContent className="p-4 flex justify-between items-center">
                            <div>
                                <h3 className="font-semibold">{booking.courts.name}</h3>
                                <p className="text-sm text-gray-500">{booking.courts.sport}</p>
                                <p className="text-sm font-medium mt-1">
                                    {format(new Date(booking.start_time), 'MMM d, h:mm a')}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="inline-block px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 capitalize">
                                    {booking.status.replace('_', ' ')}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
