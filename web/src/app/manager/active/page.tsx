import { getCurrentBookings } from '@/actions/manager'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import Link from 'next/link'
import { Timer, ChevronRight } from 'lucide-react'

export default async function ActiveSessionsPage() {
    const allBookings = await getCurrentBookings()
    const activeBookings = allBookings.filter((b: any) => b.status === 'active')

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-xl font-bold text-gray-900">Active Sessions</h1>
            <p className="text-sm text-gray-500 -mt-2">Sessions currently in progress</p>

            {activeBookings.length === 0 ? (
                <div className="p-8 text-center text-gray-400 border-2 border-dashed rounded-xl">
                    <Timer className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No active sessions right now.
                </div>
            ) : (
                <div className="space-y-3">
                    {activeBookings.map((booking: any) => (
                        <Link key={booking.id} href={`/manager/approvals/${booking.id}`}>
                            <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-500 mb-3">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            <h3 className="font-bold text-gray-900">
                                                {booking.courts?.name}
                                            </h3>
                                        </div>
                                        <p className="text-sm text-gray-600">
                                            {format(new Date(booking.start_time), 'h:mm a')} –{' '}
                                            {format(new Date(booking.end_time), 'h:mm a')}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {booking.profiles?.full_name}
                                        </p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
