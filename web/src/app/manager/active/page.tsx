import { createClient } from '@/utils/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import { Timer, Eye } from 'lucide-react'
import Link from 'next/link'

export default async function ActiveSessionsPage() {
    const supabase = await createClient()
    const now = new Date()

    const { data: activeBookings } = await supabase
        .from('bookings')
        .select(`
            *,
            profiles:user_id (full_name),
            courts (name, sport)
        `)
        .eq('status', 'active')
        .lte('start_time', now.toISOString())
        .gte('end_time', now.toISOString())
        .order('start_time', { ascending: true })

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold text-gray-900">Active Sessions</h1>
                <p className="text-gray-500 text-sm">Sessions currently in progress</p>
            </div>

            <div className="space-y-4">
                {!activeBookings || activeBookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-dashed border-gray-300 text-center space-y-4">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                            <Timer className="w-8 h-8 text-gray-400" />
                        </div>
                        <div>
                            <p className="text-lg font-medium text-gray-900">No active sessions</p>
                            <p className="text-gray-500 text-sm">There are no sessions running right now.</p>
                        </div>
                    </div>
                ) : (
                    activeBookings.map((booking: any) => (
                        <Link key={booking.id} href={`/manager/approvals/${booking.id}`} className="block">
                            <Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
                                <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <h3 className="font-bold text-lg">{booking.courts.name}</h3>
                                        <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                            {booking.courts.sport}
                                        </span>
                                        <p className="text-gray-600 text-sm mt-2">
                                            {format(new Date(booking.start_time), 'h:mm a')} - {format(new Date(booking.end_time), 'h:mm a')}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            <span className="font-medium text-sm">{booking.profiles.full_name}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-[#004d40] font-bold text-sm">
                                        <Eye className="w-4 h-4" />
                                        View Session
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))
                )}
            </div>
        </div>
    )
}
