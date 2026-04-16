'use client'

import { useState } from 'react'
import {
    ChevronDown,
    ChevronRight,
    User,
    Clock,
    Dumbbell,
    MapPin,
    Users,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Zap,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<
    string,
    { label: string; icon: React.ElementType; color: string; bg: string }
> = {
    completed: {
        label: 'Completed',
        icon: CheckCircle,
        color: 'text-green-700',
        bg: 'bg-green-50 border-green-200',
    },
    rejected: {
        label: 'Rejected',
        icon: XCircle,
        color: 'text-red-700',
        bg: 'bg-red-50 border-red-200',
    },
    cancelled: {
        label: 'Cancelled',
        icon: XCircle,
        color: 'text-gray-600',
        bg: 'bg-gray-50 border-gray-200',
    },
    active: {
        label: 'Active',
        icon: Clock,
        color: 'text-blue-700',
        bg: 'bg-blue-50 border-blue-200',
    },
    confirmed: {
        label: 'Confirmed',
        icon: CheckCircle,
        color: 'text-teal-700',
        bg: 'bg-teal-50 border-teal-200',
    },
    pending: {
        label: 'Pending',
        icon: Clock,
        color: 'text-amber-700',
        bg: 'bg-amber-50 border-amber-200',
    },
}

interface BookingLog {
    id: string
    status: string
    start_time: string
    end_time: string
    num_players: number
    equipment_ids: string[]
    players_list: string[]
    is_priority: boolean
    is_maintenance: boolean
    created_at: string
    courts: { name: string; sport: string } | null
    profiles: { full_name: string; student_id: string; email: string } | null
    equipment: { id: string; name: string; condition: string }[]
    players: { id: string; full_name: string; student_id: string; email: string }[]
}

interface BookingLogRowProps {
    booking: BookingLog
}

export function BookingLogRow({ booking }: BookingLogRowProps) {
    const [expanded, setExpanded] = useState(false)

    const cfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending
    const Icon = cfg.icon
    const isAdminBooking = booking.is_priority || booking.is_maintenance

    return (
        <>
            {/* Summary Row */}
            <tr
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    'cursor-pointer hover:bg-gray-50 transition border-b border-gray-100',
                    expanded && 'bg-gray-50'
                )}
            >
                <td className="px-4 py-3">
                    {expanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                </td>

                {/* Status badge */}
                <td className="px-4 py-3">
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
                            cfg.bg,
                            cfg.color
                        )}
                    >
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                    </span>
                </td>

                {/* Court */}
                <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 text-sm">
                        {booking.courts?.name ?? '—'}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">
                        {booking.courts?.sport ?? '—'}
                    </div>
                </td>

                {/* Booker */}
                <td className="px-4 py-3">
                    {isAdminBooking ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                            {booking.is_maintenance ? 'Maintenance' : 'Priority'}
                        </span>
                    ) : (
                        <div>
                            <div className="text-sm font-medium text-gray-900">
                                {booking.profiles?.full_name ?? '—'}
                            </div>
                            <div className="text-xs text-gray-500">
                                {booking.profiles?.student_id ?? ''}
                            </div>
                        </div>
                    )}
                </td>

                {/* Time */}
                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {format(new Date(booking.start_time), 'h:mm a')}
                    <span className="text-gray-400"> → </span>
                    {format(new Date(booking.end_time), 'h:mm a')}
                </td>

                {/* Players */}
                <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {booking.num_players || '—'}
                    </span>
                </td>

                {/* Equipment count */}
                <td className="px-4 py-3 text-center">
                    <span className="text-sm text-gray-700">
                        {booking.equipment?.length > 0 ? booking.equipment.length : '—'}
                    </span>
                </td>
            </tr>

            {/* Expanded details */}
            {expanded && (
                <tr className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {/* All Players — spans 2 cols */}
                            <div className="md:col-span-2 space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5" /> Players Involved
                                </h4>
                                {isAdminBooking ? (
                                    <p className="text-sm text-gray-700 font-medium">
                                        Admin / Manager booking
                                    </p>
                                ) : booking.players && booking.players.length > 0 ? (
                                    <div className="space-y-2">
                                        {booking.players.map((player, idx) => (
                                            <div
                                                key={player.id}
                                                className="flex items-start gap-2 p-2 bg-white rounded-lg border border-gray-100"
                                            >
                                                <div className="w-6 h-6 rounded-full bg-[#004d40]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <span className="text-[10px] font-bold text-[#004d40]">
                                                        {idx + 1}
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                                        {player.full_name}
                                                        {player.id ===
                                                            booking.profiles?.student_id && (
                                                            <span className="ml-1.5 text-[10px] font-bold bg-[#004d40]/10 text-[#004d40] px-1.5 py-0.5 rounded">
                                                                Booker
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Roll: {player.student_id || '—'}
                                                    </p>
                                                    {player.email && (
                                                        <p className="text-xs text-gray-400 truncate">
                                                            {player.email}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* Fallback: only booker info available */
                                    <div className="p-2 bg-white rounded-lg border border-gray-100">
                                        <p className="text-sm font-semibold text-gray-900">
                                            {booking.profiles?.full_name ?? '—'}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            Roll: {booking.profiles?.student_id ?? '—'}
                                        </p>
                                        {booking.profiles?.email && (
                                            <p className="text-xs text-gray-400">
                                                {booking.profiles.email}
                                            </p>
                                        )}
                                        <span className="text-[10px] font-bold bg-[#004d40]/10 text-[#004d40] px-1.5 py-0.5 rounded mt-1 inline-block">
                                            Booker
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Session */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" /> Session
                                </h4>
                                <div className="space-y-0.5">
                                    <p className="text-sm text-gray-700">
                                        <span className="font-medium">Start:</span>{' '}
                                        {format(new Date(booking.start_time), 'h:mm a, MMM d yyyy')}
                                    </p>
                                    <p className="text-sm text-gray-700">
                                        <span className="font-medium">End:</span>{' '}
                                        {format(new Date(booking.end_time), 'h:mm a, MMM d yyyy')}
                                    </p>
                                    <p className="text-sm text-gray-700">
                                        <span className="font-medium">Players:</span>{' '}
                                        {booking.num_players || '—'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Booked on{' '}
                                        {format(new Date(booking.created_at), 'MMM d, yyyy h:mm a')}
                                    </p>
                                </div>
                            </div>

                            {/* Equipment */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                    <Dumbbell className="w-3.5 h-3.5" /> Equipment
                                </h4>
                                {booking.equipment?.length > 0 ? (
                                    <div className="space-y-1">
                                        {booking.equipment.map((eq) => (
                                            <div
                                                key={eq.id}
                                                className="flex items-center justify-between text-sm"
                                            >
                                                <span className="text-gray-800">{eq.name}</span>
                                                <span
                                                    className={cn(
                                                        'text-[11px] font-bold px-1.5 py-0.5 rounded',
                                                        eq.condition === 'good'
                                                            ? 'bg-green-100 text-green-700'
                                                            : eq.condition === 'minor_damage'
                                                              ? 'bg-amber-100 text-amber-700'
                                                              : 'bg-red-100 text-red-700'
                                                    )}
                                                >
                                                    {eq.condition?.replace('_', ' ') ?? 'unknown'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">No equipment issued</p>
                                )}
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}
