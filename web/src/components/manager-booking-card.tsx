'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format, differenceInMinutes, isBefore, isAfter } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, User, Dumbbell, PlayCircle, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Booking {
    id: string
    start_time: string // ISO string
    end_time: string // ISO string
    status: string
    equipment_ids: string[] | null
    equipment_names?: string[]
    num_players?: number
    profiles: {
        full_name: string
        role: string
    }
    courts: {
        name: string
        sport: string
    }
}

interface BookingCardProps {
    booking: Booking
}

export function ManagerBookingCard({ booking }: BookingCardProps) {
    const [statusLabel, setStatusLabel] = useState('')

    useEffect(() => {
        const updateStatus = () => {
            const now = new Date()
            const start = new Date(booking.start_time)
            const end = new Date(booking.end_time)

            // Use the actual booking status, not just time
            if (booking.status === 'active') {
                if (isAfter(now, end)) {
                    setStatusLabel('Overdue ⏰')
                } else {
                    setStatusLabel('Running 🟢')
                }
            } else if (booking.status === 'waiting_manager') {
                setStatusLabel('Waiting for Approval')
            } else if (isBefore(now, start)) {
                const diff = differenceInMinutes(start, now)
                if (diff <= 60) {
                    setStatusLabel(`Starts in ${diff} min`)
                } else {
                    setStatusLabel('Upcoming')
                }
            } else {
                // Time is within range but status is still pending/confirmed
                setStatusLabel('Waiting for Approval')
            }
        }

        updateStatus()
        const interval = setInterval(updateStatus, 30000) // Update every 30s
        return () => clearInterval(interval)
    }, [booking.start_time, booking.end_time])

    const formatTime = (isoString: string) => format(new Date(isoString), 'h:mm a')

    // Determine user display: Name (Role if admin)
    const isAdmin =
        booking.profiles.role === 'admin' ||
        booking.profiles.role === 'manager' ||
        booking.profiles.role === 'superuser'
    const userName = booking.profiles.full_name || 'Unknown User'

    return (
        <Link
            href={`/manager/approvals/${booking.id}`}
            className="block transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
            <Card
                className={cn(
                    'border-l-4 shadow-sm hover:shadow-md transition-shadow relative',
                    statusLabel.includes('Running')
                        ? 'border-l-green-500'
                        : statusLabel.includes('Overdue')
                          ? 'border-l-amber-500'
                          : statusLabel.includes('Waiting')
                            ? 'border-l-orange-400'
                            : 'border-l-blue-500',
                    isAdmin ? 'bg-amber-50/50' : 'bg-white'
                )}
            >
                <CardContent className="p-5 flex flex-col gap-3">
                    {/* Header: Court & Status */}
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">
                                {booking.courts.name}
                            </h3>
                            <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full inline-block mt-1">
                                {booking.courts.sport}
                            </span>
                        </div>
                        <div
                            className={cn(
                                'text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap',
                                statusLabel.includes('Running')
                                    ? 'bg-green-100 text-green-700'
                                    : statusLabel.includes('Overdue')
                                      ? 'bg-amber-100 text-amber-700'
                                      : statusLabel.includes('Starts')
                                        ? 'bg-yellow-100 text-yellow-700'
                                        : statusLabel.includes('Waiting')
                                          ? 'bg-orange-100 text-orange-700'
                                          : 'bg-blue-50 text-blue-600'
                            )}
                        >
                            {statusLabel}
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="space-y-2 mt-1">
                        <div className="flex items-center gap-2 text-gray-700">
                            {isAdmin ? (
                                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                            ) : (
                                <User className="w-4 h-4 text-gray-400" />
                            )}
                            <span
                                className={cn(
                                    'font-medium text-sm',
                                    isAdmin && 'text-amber-700 font-bold'
                                )}
                            >
                                {userName} {isAdmin && '(Admin/Superuser)'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-gray-700">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-sm">
                                {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-gray-700">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-sm">
                                {booking.num_players
                                    ? `${booking.num_players} Players`
                                    : '2 Players'}
                            </span>
                        </div>

                        {/* Equipment */}

                        {booking.equipment_names && booking.equipment_names.length > 0 && (
                            <div className="flex items-start gap-2 text-gray-600 text-sm mt-1 bg-gray-50 p-2 rounded">
                                <Dumbbell className="w-4 h-4 mt-0.5 shrink-0" />
                                <span className="line-clamp-2">
                                    {booking.equipment_names.join(', ')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Footer Action */}
                    <div className="pt-2 mt-auto text-center border-t border-gray-100">
                        <span className="text-xs font-bold text-primary flex items-center justify-center gap-1 group">
                            TAP TO OPEN
                            <PlayCircle className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                        </span>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
