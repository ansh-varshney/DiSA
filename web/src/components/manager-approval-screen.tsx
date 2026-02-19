'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format, differenceInSeconds, differenceInMinutes, addMinutes } from 'date-fns'
import {
    Loader2, Play, Ban, AlertOctagon, User, Smartphone, Users,
    Clock, ArrowLeft, Phone, AlertTriangle, Package
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { updateBookingStatus, endSession, reportEquipmentLost } from '@/actions/manager'
import { ReportStudentDialog } from '@/components/report-student-dialog'
import { RateStudentsScreen } from '@/components/rate-students-screen'

interface Player {
    id: string
    full_name: string
    student_id: string
    phone_number: string | null
    is_booker: boolean
}

interface Equipment {
    id: string
    name: string
}

interface BookingDetailsById {
    id: string
    start_time: string
    end_time: string
    status: string
    num_players: number
    courts: {
        name: string
        sport: string
    }
    all_players: Player[]
    equipment: Equipment[]
}

type EquipmentCondition = 'good' | 'minor_damage' | 'damaged'

export function ManagerApprovalScreen({ booking }: { booking: BookingDetailsById }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [showRatingScreen, setShowRatingScreen] = useState(false)
    const [reportingStudent, setReportingStudent] = useState<Player | null>(null)

    // Equipment condition state
    const [equipmentConditions, setEquipmentConditions] = useState<Record<string, EquipmentCondition>>(
        () => Object.fromEntries(booking.equipment.map(e => [e.id, 'good' as EquipmentCondition]))
    )

    // Derived state
    const startTime = new Date(booking.start_time)
    const endTime = new Date(booking.end_time)
    const expirationTime = addMinutes(startTime, 10) // 10 mins buffer

    // Timer Logic
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const secondsToStart = differenceInSeconds(startTime, currentTime)
    const secondsToEnd = differenceInSeconds(endTime, currentTime)
    const secondsToExpiration = differenceInSeconds(expirationTime, currentTime)

    const isUpcoming = secondsToStart > 0
    const isExpired = booking.status === 'pending_confirmation' && secondsToExpiration < 0
    const isActive = booking.status === 'active'

    const handleStatusUpdate = async (newStatus: 'active' | 'rejected' | 'completed') => {
        setLoading(true)
        try {
            const result = await updateBookingStatus(booking.id, newStatus)
            if (result.error) {
                alert(result.error)
            } else {
                router.refresh()
            }
        } catch (e) {
            console.error(e)
            alert('Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    const handleEndSession = async () => {
        if (!confirm('Are you sure you want to end this session?')) return

        setLoading(true)
        try {
            const conditions = Object.entries(equipmentConditions).map(([equipmentId, condition]) => ({
                equipmentId,
                condition
            }))
            const result = await endSession(booking.id, conditions)
            if (result.error) {
                alert(result.error)
            } else {
                // Show rating screen
                setShowRatingScreen(true)
            }
        } catch (e) {
            console.error(e)
            alert('Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    const handleEquipmentLost = async (equipmentId: string, equipmentName: string) => {
        if (!confirm(`Mark "${equipmentName}" as LOST? This will reset points for ALL players and notify admin.`)) return

        setLoading(true)
        try {
            const result = await reportEquipmentLost(booking.id, equipmentId)
            if (result.error) {
                alert(result.error)
            } else {
                alert('Equipment marked as lost. Admin has been notified.')
                router.refresh()
            }
        } catch (e) {
            console.error(e)
            alert('Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    // Format seconds into MM:SS
    const formatCountdown = (totalSeconds: number) => {
        const m = Math.floor(Math.abs(totalSeconds) / 60)
        const s = Math.abs(totalSeconds) % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    // Rating screen after session end
    if (showRatingScreen) {
        return (
            <div className="max-w-md mx-auto pb-20">
                <RateStudentsScreen
                    bookingId={booking.id}
                    players={booking.all_players}
                    onComplete={() => router.push('/manager')}
                />
            </div>
        )
    }

    if (booking.status === 'cancelled') {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                <Ban className="w-16 h-16 text-red-200" />
                <h2 className="text-xl font-bold text-gray-700">Booking Cancelled</h2>
                <p className="text-gray-500">This booking has been cancelled or expired.</p>
                <Button variant="outline" onClick={() => router.push('/manager')}>Back to Dashboard</Button>
            </div>
        )
    }

    return (
        <div className="max-w-md mx-auto space-y-4 pb-20">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <Button variant="ghost" size="icon" onClick={() => router.push('/manager')}>
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </Button>
                <h1 className="text-xl font-bold text-gray-800">
                    {isActive ? 'Active Session' : 'Manager Approval'}
                </h1>
            </div>

            {/* Student Details Card */}
            <Card>
                <CardHeader className="bg-gray-50 border-b border-gray-100 py-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                        Student Details ({booking.all_players.length})
                    </CardTitle>
                    {!isActive && (
                        <span className="text-xs text-red-500 font-medium cursor-pointer hover:underline"
                            onClick={() => {/* scroll hint */ }}>
                            Tap name to report
                        </span>
                    )}
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                    {booking.all_players.map((player) => (
                        <div key={player.id} className="flex items-start gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0",
                                player.is_booker ? "bg-blue-600" : "bg-gray-400"
                            )}>
                                {player.full_name?.[0] || '?'}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    {player.full_name}
                                    {player.is_booker && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">BOOKER</span>}
                                </h3>
                                <p className="text-sm text-gray-500 flex items-center gap-2">
                                    <span>ID: {player.student_id}</span>
                                    {player.phone_number && (
                                        <>
                                            <span>•</span>
                                            <a href={`tel:${player.phone_number}`} className="flex items-center gap-1 text-blue-600 hover:text-blue-700">
                                                <Phone className="w-3 h-3" />
                                                {player.phone_number}
                                            </a>
                                        </>
                                    )}
                                </p>
                            </div>
                            {/* Report Button */}
                            <button
                                onClick={() => setReportingStudent(player)}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                title="Report student"
                            >
                                <AlertTriangle className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Session Info */}
            <Card>
                <CardHeader className="bg-gray-50 border-b border-gray-100 py-3">
                    <CardTitle className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                        Session Info
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">{booking.courts.name}</h2>
                        <p className="text-gray-500 text-sm">{booking.courts.sport}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex items-center gap-2 mb-1 text-gray-500 text-xs font-semibold uppercase">
                                <Clock className="w-3 h-3" /> Time Sync
                            </div>
                            <div className="font-bold text-gray-800">
                                {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                Duration: {differenceInMinutes(endTime, startTime)} mins
                            </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex items-center gap-2 mb-1 text-gray-500 text-xs font-semibold uppercase">
                                <Users className="w-3 h-3" /> Capacity
                            </div>
                            <div className="font-bold text-gray-800">
                                {booking.num_players || 2} Players
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                Registered: {booking.all_players.length}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Equipment Management Card (Active Session) */}
            {isActive && booking.equipment.length > 0 && (
                <Card>
                    <CardHeader className="bg-gray-50 border-b border-gray-100 py-3">
                        <CardTitle className="text-sm font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Equipment Condition Check
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        {booking.equipment.map(item => (
                            <div key={item.id} className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-gray-800 text-sm">{item.name}</span>
                                    <button
                                        onClick={() => handleEquipmentLost(item.id, item.name)}
                                        className="text-xs text-red-500 hover:text-red-700 font-bold border border-red-200 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                        disabled={loading}
                                    >
                                        LOST
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    {(['good', 'minor_damage', 'damaged'] as const).map(condition => {
                                        const labels: Record<string, string> = {
                                            good: 'GOOD',
                                            minor_damage: 'MINOR',
                                            damaged: 'DAMAGED'
                                        }
                                        const colors: Record<string, string> = {
                                            good: 'bg-green-100 text-green-700 border-green-300',
                                            minor_damage: 'bg-yellow-100 text-yellow-700 border-yellow-300',
                                            damaged: 'bg-red-100 text-red-700 border-red-300'
                                        }
                                        const activeColors: Record<string, string> = {
                                            good: 'bg-green-500 text-white border-green-500',
                                            minor_damage: 'bg-yellow-500 text-white border-yellow-500',
                                            damaged: 'bg-red-500 text-white border-red-500'
                                        }
                                        const isSelected = equipmentConditions[item.id] === condition
                                        return (
                                            <button
                                                key={condition}
                                                onClick={() => setEquipmentConditions(prev => ({
                                                    ...prev,
                                                    [item.id]: condition
                                                }))}
                                                className={cn(
                                                    "flex-1 py-2 text-xs font-bold rounded-lg border transition-all",
                                                    isSelected ? activeColors[condition] : colors[condition]
                                                )}
                                            >
                                                {labels[condition]}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Equipment Issued (Pre-Active) */}
            {!isActive && booking.equipment.length > 0 && (
                <div className="pt-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Equipment Issued</div>
                    <div className="flex flex-wrap gap-2">
                        {booking.equipment.map(item => (
                            <span key={item.id} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-sm font-medium border border-gray-200">
                                {item.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Action Area */}
            <div className="space-y-3 pt-2">
                {isActive ? (
                    // ACTIVE SESSION VIEW
                    <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                        <div className="bg-green-50 border-2 border-green-500 rounded-xl p-6 text-center shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                            <div className="text-green-800 font-bold uppercase tracking-widest text-sm mb-2 opacity-80 animate-pulse">Session Active</div>
                            <div className="text-5xl font-black text-green-700 tabular-nums tracking-tight">
                                {formatCountdown(secondsToEnd)}
                            </div>
                            <div className="text-green-600 font-medium text-sm mt-1">Remaining</div>
                        </div>

                        <Button
                            className="w-full h-14 text-lg font-bold bg-[#004d40] hover:bg-[#003d33] text-white shadow-lg"
                            onClick={handleEndSession}
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            ) : (
                                <>End Session & Rate Students</>
                            )}
                        </Button>

                        <Button
                            className="w-full bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 h-12 font-bold"
                            onClick={() => {
                                if (confirm('EMERGENCY: Are you sure you want to force-end this session immediately?')) {
                                    handleStatusUpdate('completed')
                                }
                            }}
                            disabled={loading}
                        >
                            <AlertOctagon className="w-4 h-4 mr-2" />
                            Emergency End (Skip Rating)
                        </Button>
                    </div>
                ) : (
                    // PENDING SESSION VIEW
                    <>
                        <Button
                            className={cn(
                                "w-full h-14 text-lg font-bold shadow-lg transition-all",
                                isUpcoming ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-[#004d40] hover:bg-[#003d33] text-white"
                            )}
                            onClick={() => handleStatusUpdate('active')}
                            disabled={isUpcoming || isExpired || loading}
                        >
                            {loading ? (
                                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            ) : isUpcoming ? (
                                <>Starts in {formatCountdown(secondsToStart)}</>
                            ) : isExpired ? (
                                "Expired"
                            ) : (
                                <>
                                    <Play className="w-5 h-5 mr-2 fill-current" />
                                    Accept Play
                                </>
                            )}
                        </Button>

                        {isExpired && (
                            <div className="text-center bg-red-50 p-4 rounded-lg border border-red-100">
                                <p className="text-red-700 font-bold mb-1">Booking Auto-Cancelled</p>
                                <p className="text-red-600 text-sm">
                                    Manager approval window missed.
                                    <br />
                                    <span className="font-semibold underline">Student will be penalized.</span>
                                </p>
                            </div>
                        )}

                        <Button
                            variant="outline"
                            className="w-full h-12 border-red-200 text-red-700 hover:bg-red-50 font-semibold"
                            onClick={() => handleStatusUpdate('rejected')}
                            disabled={loading}
                        >
                            Reject / Cancel
                        </Button>
                    </>
                )}
            </div>

            {/* Report Student Dialog */}
            {reportingStudent && (
                <ReportStudentDialog
                    bookingId={booking.id}
                    student={reportingStudent}
                    onClose={() => setReportingStudent(null)}
                    onSuccess={() => {
                        setReportingStudent(null)
                        alert('Report submitted successfully')
                        router.refresh()
                    }}
                />
            )}
        </div>
    )
}
