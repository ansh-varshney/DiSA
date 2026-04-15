'use client'

import { useState, useTransition } from 'react'
import { acceptPlayRequest, rejectPlayRequest } from '@/actions/notifications'
import { cn } from '@/lib/utils'
import { Inbox, CheckCircle, XCircle, Clock, CalendarDays, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

type PlayRequest = {
    id: string
    status: 'pending' | 'accepted' | 'rejected' | 'expired'
    created_at: string
    bookings: {
        id: string
        start_time: string
        end_time: string
        status: string
        courts: { name: string; sport: string }
    }
    requester: { full_name: string; student_id: string }
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="w-4 h-4" /> },
    accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-4 h-4" /> },
    rejected: { label: 'Declined', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-4 h-4" /> },
    expired: { label: 'Expired', color: 'bg-gray-100 text-gray-500', icon: <Clock className="w-4 h-4" /> },
}

function sportLabel(sport: string) {
    return sport.charAt(0).toUpperCase() + sport.slice(1)
}

export function PlayRequestsClient({ requests }: { requests: PlayRequest[] }) {
    const router = useRouter()
    const [list, setList] = useState(requests)
    const [responding, setResponding] = useState<string | null>(null)
    const [, startTransition] = useTransition()

    async function handleAccept(id: string) {
        setResponding(id)
        const result = await acceptPlayRequest(id)
        if ('error' in result) {
            alert(result.error)
            setResponding(null)
            return
        }
        setList((prev) => prev.map((r) => r.id === id ? { ...r, status: 'accepted' as const } : r))
        setResponding(null)
        startTransition(() => router.refresh())
    }

    async function handleReject(id: string) {
        setResponding(id)
        const result = await rejectPlayRequest(id)
        if ('error' in result) {
            alert(result.error)
            setResponding(null)
            return
        }
        setList((prev) => prev.map((r) => r.id === id ? { ...r, status: 'rejected' as const } : r))
        setResponding(null)
        startTransition(() => router.refresh())
    }

    const pending = list.filter((r) => r.status === 'pending')
    const past = list.filter((r) => r.status !== 'pending')

    if (list.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                <Inbox className="w-12 h-12 opacity-30" />
                <p className="text-sm font-medium">No play requests yet</p>
            </div>
        )
    }

    function RequestCard({ r }: { r: PlayRequest }) {
        const cfg = statusConfig[r.status] || statusConfig.expired
        const booking = r.bookings
        const court = booking?.courts
        const isPending = r.status === 'pending'
        const isLoading = responding === r.id

        return (
            <div className={cn(
                'p-4 rounded-xl border bg-white space-y-3',
                isPending ? 'border-blue-200 shadow-sm' : 'border-gray-100 opacity-80',
            )}>
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-sm font-semibold text-gray-900">{r.requester?.full_name}</p>
                        <p className="text-xs text-gray-400">{r.requester?.student_id}</p>
                    </div>
                    <span className={cn('flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full', cfg.color)}>
                        {cfg.icon}
                        {cfg.label}
                    </span>
                </div>

                {/* Booking details */}
                {booking && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                            <span>{court?.name} — {sportLabel(court?.sport || '')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                            <span>
                                {format(new Date(booking.start_time), 'EEE, MMM d · h:mm a')}
                                {' – '}
                                {format(new Date(booking.end_time), 'h:mm a')}
                            </span>
                        </div>
                    </div>
                )}

                {/* Requested at */}
                <p className="text-xs text-gray-400">
                    Requested {format(new Date(r.created_at), 'MMM d, yyyy · h:mm a')}
                </p>

                {/* Actions — only for pending */}
                {isPending && (
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => handleAccept(r.id)}
                            disabled={isLoading}
                            className="flex-1 py-2 text-sm font-semibold rounded-lg bg-[#004d40] text-white hover:bg-[#003d32] disabled:opacity-50 transition-colors"
                        >
                            {isLoading ? 'Processing…' : 'Accept'}
                        </button>
                        <button
                            onClick={() => handleReject(r.id)}
                            disabled={isLoading}
                            className="flex-1 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                            {isLoading ? 'Processing…' : 'Decline'}
                        </button>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {pending.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Pending ({pending.length})
                    </h2>
                    {pending.map((r) => <RequestCard key={r.id} r={r} />)}
                </section>
            )}

            {past.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        History
                    </h2>
                    {past.map((r) => <RequestCard key={r.id} r={r} />)}
                </section>
            )}
        </div>
    )
}
