import { createClient } from '@/utils/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { Timer, StopCircle } from 'lucide-react'

export default async function ActiveSessionsPage() {
    const supabase = await createClient()
    const { data: activeBookings } = await supabase
        .from('bookings')
        .select(`
            *,
            profiles:user_id (full_name),
            courts (name)
        `)
        .eq('status', 'confirmed') // Confirmed bookings that haven't ended yet
        // In real app we also check valid time window
        .order('start_time', { ascending: true })

    return (
        <div className="p-4 md:p-8 space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Active Sessions</h1>

            <div className="space-y-4">
                {activeBookings?.length === 0 ? (
                    <p className="text-gray-500">No active sessions right now.</p>
                ) : (
                    activeBookings?.map((booking: any) => (
                        <Card key={booking.id} className="border-l-4 border-l-green-500">
                            <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="font-bold text-lg">{booking.courts.name}</h3>
                                    <p className="text-gray-600 text-sm">
                                        {format(new Date(booking.start_time), 'h:mm a')} - {format(new Date(booking.end_time), 'h:mm a')}
                                    </p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                        <span className="font-medium">{booking.profiles.full_name}</span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button variant="destructive">
                                        <StopCircle className="w-4 h-4 mr-2" />
                                        End Session
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
