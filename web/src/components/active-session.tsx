'use client'

import { useState, useEffect } from 'react'
import { differenceInSeconds, format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Timer, Phone } from 'lucide-react'

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

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const endTime = new Date(booking.end_time)
    const secondsRemaining = differenceInSeconds(endTime, currentTime)

    const formatCountdown = (totalSeconds: number) => {
        if (totalSeconds <= 0) return '0:00'
        const m = Math.floor(totalSeconds / 60)
        const s = totalSeconds % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const isOvertime = secondsRemaining <= 0
    const isLowTime = secondsRemaining > 0 && secondsRemaining <= 300 // Last 5 minutes

    return (
        <Card className="border-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.15)] overflow-hidden">
            <CardContent className="p-0">
                {/* Timer Header */}
                <div className={`p-6 text-center ${isOvertime ? 'bg-red-50' : isLowTime ? 'bg-yellow-50' : 'bg-green-50'}`}>
                    <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${isOvertime ? 'text-red-600 animate-pulse' : isLowTime ? 'text-yellow-700' : 'text-green-700 animate-pulse'
                        }`}>
                        {isOvertime ? '⚠ Session Overtime' : 'Session Active'}
                    </div>
                    <div className={`text-6xl font-black tabular-nums tracking-tight ${isOvertime ? 'text-red-600' : isLowTime ? 'text-yellow-700' : 'text-green-700'
                        }`}>
                        {formatCountdown(Math.abs(secondsRemaining))}
                    </div>
                    <div className={`font-medium text-sm mt-1 ${isOvertime ? 'text-red-500' : isLowTime ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                        {isOvertime ? 'Over Time' : 'Remaining'}
                    </div>
                </div>

                {/* Session Details */}
                <div className="p-4 space-y-3">
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

                    {/* Emergency Button */}
                    <Button
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12"
                        onClick={() => {
                            if (confirm('⚠️ This will send an emergency alert to the manager. Are you sure?')) {
                                alert('Emergency alert sent to manager!')
                            }
                        }}
                    >
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        ⚠ EMERGENCY — Alert Manager
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
