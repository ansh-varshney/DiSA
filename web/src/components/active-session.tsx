'use client'

import { useState, useEffect } from 'react'
import { differenceInSeconds, format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Zap } from 'lucide-react'
import { studentEmergencyAlert } from '@/actions/bookings'
import { useRouter } from 'next/navigation'

interface Booking {
    id: string
    start_time: string
    end_time: string
    status: string
    num_players: number
    courts: { name: string; sport: string }
}

export function ActiveSessionView({ booking }: { booking: Booking }) {
    const [currentTime, setCurrentTime] = useState(new Date())
    const [emergencyOpen, setEmergencyOpen] = useState(false)
    const [emergencyReason, setEmergencyReason] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const endTime = new Date(booking.end_time)
    const secondsRemaining = differenceInSeconds(endTime, currentTime)
    const totalSeconds = differenceInSeconds(endTime, new Date(booking.start_time))
    const pct = Math.max(0, Math.min(100, (secondsRemaining / totalSeconds) * 100))

    const fmt = (secs: number) => {
        const abs = Math.abs(secs)
        const m = Math.floor(abs / 60).toString().padStart(2, '0')
        const s = (abs % 60).toString().padStart(2, '0')
        return `${m}:${s}`
    }

    const isOvertime = secondsRemaining <= 0
    const isLowTime = secondsRemaining > 0 && secondsRemaining <= 300 // Last 5 min

    const handleEmergency = async () => {
        if (!emergencyReason.trim()) return
        setLoading(true)
        const result = await studentEmergencyAlert(booking.id, emergencyReason)
        setLoading(false)
        if (result.error) {
            alert(result.error)
        } else {
            setEmergencyOpen(false)
            setEmergencyReason('')
            alert('Alert sent to manager and admin.')
            router.refresh()
        }
    }

    return (
        <Card className="border-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.15)] overflow-hidden">
            <CardContent className="p-0">
                {/* Timer Circle Header */}
                <div className={`flex flex-col items-center py-8 ${isOvertime ? 'bg-red-50' : isLowTime ? 'bg-yellow-50' : 'bg-green-50'}`}>
                    <div className={`text-xs font-bold uppercase tracking-widest mb-3 ${isOvertime ? 'text-red-600 animate-pulse' : isLowTime ? 'text-yellow-700' : 'text-green-700 animate-pulse'}`}>
                        {isOvertime ? '⚠ Session Overtime' : 'Session Active'}
                    </div>

                    {/* SVG Circle */}
                    <div className="relative w-36 h-36">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                            <circle
                                cx="60" cy="60" r="54" fill="none"
                                stroke={isOvertime ? '#ef4444' : isLowTime ? '#f59e0b' : '#16a34a'}
                                strokeWidth="8"
                                strokeDasharray={`${2 * Math.PI * 54}`}
                                strokeDashoffset={`${2 * Math.PI * 54 * (1 - pct / 100)}`}
                                strokeLinecap="round"
                                className="transition-all duration-1000"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-3xl font-mono font-black tabular-nums ${isOvertime ? 'text-red-600' : isLowTime ? 'text-yellow-700' : 'text-green-700'}`}>
                                {fmt(secondsRemaining)}
                            </span>
                            <span className="text-xs text-gray-500 mt-1">
                                {isOvertime ? 'overtime' : 'remaining'}
                            </span>
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 mt-3">
                        Ends at {format(endTime, 'h:mm a')}
                    </p>
                </div>

                {/* Session Info */}
                <div className="p-4 space-y-1">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">{booking.courts.name}</h3>
                            <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {booking.courts.sport}
                            </span>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                            <p>{format(new Date(booking.start_time), 'h:mm a')} — {format(endTime, 'h:mm a')}</p>
                            <p className="text-xs">{booking.num_players || 2} players</p>
                        </div>
                    </div>
                </div>

                {/* Emergency Section */}
                <div className="px-4 pb-4 space-y-3">
                    {!emergencyOpen ? (
                        <Button
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12"
                            onClick={() => setEmergencyOpen(true)}
                        >
                            <Zap className="w-5 h-5 mr-2" />
                            ⚠ EMERGENCY — Alert Manager
                        </Button>
                    ) : (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                                <AlertTriangle className="w-4 h-4" />
                                Emergency Alert — Reason Required
                            </div>
                            <textarea
                                className="w-full border border-red-200 rounded-lg p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                                rows={3}
                                placeholder="Describe the emergency (e.g. injury, fight, equipment damage)..."
                                value={emergencyReason}
                                onChange={(e) => setEmergencyReason(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setEmergencyOpen(false); setEmergencyReason('') }}
                                    className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEmergency}
                                    disabled={!emergencyReason.trim() || loading}
                                    className="flex-1 py-2.5 bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold"
                                >
                                    {loading ? 'Sending…' : 'Send Alert'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
