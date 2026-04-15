'use client'

import { useState } from 'react'
import { format, differenceInSeconds } from 'date-fns'
import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { cancelBooking, withdrawFromBooking } from '@/actions/bookings'
import {
    Clock, Calendar, CheckCircle, XCircle, AlertTriangle,
    Timer, Loader2, ChevronDown, ChevronUp
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ActiveSessionView } from '@/components/active-session'

interface Booking {
    id: string
    user_id: string
    start_time: string
    end_time: string
    status: string
    num_players: number
    courts: { name: string; sport: string }
}

interface ReservationsListProps {
    current: Booking[]
    upcoming: Booking[]
    past: Booking[]
    userId: string
}

const statusColors: Record<string, string> = {
    pending_confirmation: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    waiting_manager: 'bg-amber-100 text-amber-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
    rejected: 'bg-red-100 text-red-700',
}

export function ReservationsList({ current, upcoming, past, userId }: ReservationsListProps) {
    const router = useRouter()
    const [cancellingId, setCancellingId] = useState<string | null>(null)
    const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
    const [showPast, setShowPast] = useState(false)
    const [pastLimit, setPastLimit] = useState(10)

    const handleCancel = async (bookingId: string) => {
        if (!confirm('Cancel this booking?')) return
        setCancellingId(bookingId)
        try {
            const result = await cancelBooking(bookingId)
            if (result.error) alert(result.error)
            else router.refresh()
        } finally {
            setCancellingId(null)
        }
    }

    const handleWithdraw = async (bookingId: string) => {
        if (!confirm('Withdraw from this booking? The booking will continue without you.')) return
        setWithdrawingId(bookingId)
        try {
            const result = await withdrawFromBooking(bookingId) as any
            if (result.error) alert(result.error)
            else {
                if (result.cancelled) {
                    alert(result.reason || 'Booking was cancelled as player count dropped below minimum.')
                }
                router.refresh()
            }
        } finally {
            setWithdrawingId(null)
        }
    }

    return (
        <div className="space-y-6">
            {/* Active Session */}
            {current.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-sm font-bold text-green-700 uppercase tracking-wide flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Active Session
                    </h2>
                    {current.map(booking => (
                        <ActiveSessionView key={booking.id} booking={booking} />
                    ))}
                </div>
            )}

            {/* Upcoming */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Upcoming ({upcoming.length})
                </h2>
                {upcoming.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 border-2 border-dashed rounded-xl">
                        No upcoming bookings
                    </div>
                ) : (
                    upcoming.map(booking => (
                        <Card key={booking.id} className="border-l-4 border-l-blue-400">
                            <CardContent className="p-4 flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-gray-800">{booking.courts.name}</h3>
                                    <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                        {booking.courts.sport}
                                    </span>
                                    <p className="text-sm text-gray-600 mt-2 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {format(new Date(booking.start_time), 'MMM d, h:mm a')} — {format(new Date(booking.end_time), 'h:mm a')}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">{booking.num_players || 2} players</p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className={cn(
                                        "px-2 py-1 text-xs rounded-full font-semibold capitalize",
                                        statusColors[booking.status] || 'bg-gray-100 text-gray-600'
                                    )}>
                                        {booking.status.replace(/_/g, ' ')}
                                    </span>
                                    {['pending_confirmation', 'confirmed', 'waiting_manager'].includes(booking.status) && (
                                        booking.user_id === userId ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                                                onClick={() => handleCancel(booking.id)}
                                                disabled={cancellingId === booking.id}
                                            >
                                                {cancellingId === booking.id ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <>
                                                        <XCircle className="w-3 h-3 mr-1" />
                                                        Cancel
                                                    </>
                                                )}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 text-xs"
                                                onClick={() => handleWithdraw(booking.id)}
                                                disabled={withdrawingId === booking.id}
                                            >
                                                {withdrawingId === booking.id ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <>
                                                        <XCircle className="w-3 h-3 mr-1" />
                                                        Withdraw
                                                    </>
                                                )}
                                            </Button>
                                        )
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Past */}
            <div className="space-y-3">
                <button
                    onClick={() => setShowPast(!showPast)}
                    className="text-sm font-bold text-gray-400 uppercase tracking-wide flex items-center gap-2 hover:text-gray-600 transition-colors w-full"
                >
                    <Clock className="w-4 h-4" />
                    Past ({past.length})
                    {showPast ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                </button>
                {showPast && (
                    <div className="space-y-2">
                        {past.length === 0 ? (
                            <p className="text-center text-gray-400 text-sm p-4">No past bookings</p>
                        ) : (
                            <>
                                {past.slice(0, pastLimit).map(booking => (
                                    <Card key={booking.id} className="opacity-70">
                                        <CardContent className="p-3 flex justify-between items-center">
                                            <div>
                                                <h3 className="font-semibold text-gray-700 text-sm">{booking.courts.name}</h3>
                                                <p className="text-xs text-gray-400">
                                                    {format(new Date(booking.start_time), 'MMM d, h:mm a')}
                                                </p>
                                            </div>
                                            <span className={cn(
                                                "px-2 py-0.5 text-xs rounded-full capitalize",
                                                statusColors[booking.status] || 'bg-gray-100 text-gray-600'
                                            )}>
                                                {booking.status.replace(/_/g, ' ')}
                                            </span>
                                        </CardContent>
                                    </Card>
                                ))}
                                {past.length > pastLimit && (
                                    <button
                                        onClick={() => setPastLimit(l => l + 10)}
                                        className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors"
                                    >
                                        Show more ({past.length - pastLimit} remaining)
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
