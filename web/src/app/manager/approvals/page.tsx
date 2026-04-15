import { getCurrentBookings } from '@/actions/manager'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Clock, ChevronRight } from 'lucide-react'

const statusColors: Record<string, string> = {
    pending_confirmation: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
    waiting_manager: 'bg-amber-100 text-amber-800 border-amber-200',
    active: 'bg-green-100 text-green-800 border-green-200',
}

const statusLabels: Record<string, string> = {
    pending_confirmation: 'Pending',
    confirmed: 'Confirmed',
    waiting_manager: 'Waiting',
    active: 'Active',
}

export default async function ApprovalsPage() {
    const bookings = await getCurrentBookings()

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-xl font-bold text-gray-900">Today&apos;s Bookings</h1>
            <p className="text-sm text-gray-500 -mt-2">Tap a booking to manage it</p>

            {bookings.length === 0 ? (
                <div className="p-8 text-center text-gray-400 border-2 border-dashed rounded-xl">
                    No bookings right now.
                </div>
            ) : (
                <div className="space-y-3">
                    {bookings.map((booking: any) => (
                        <Link
                            key={booking.id}
                            href={`/manager/approvals/${booking.id}`}
                        >
                            <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-yellow-400 mb-3">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-gray-900">{booking.courts?.name}</h3>
                                            <span className={cn(
                                                'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border',
                                                statusColors[booking.status] || 'bg-gray-100 text-gray-600'
                                            )}>
                                                {statusLabels[booking.status] || booking.status}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {format(new Date(booking.start_time), 'h:mm a')} – {format(new Date(booking.end_time), 'h:mm a')}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {booking.profiles?.full_name || 'Unknown'}
                                            {booking.equipment_names?.length > 0 && (
                                                <span className="text-gray-400"> · {booking.equipment_names.join(', ')}</span>
                                            )}
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
