'use client'

import { useState, useEffect, useRef } from 'react'
import { differenceInSeconds, format } from 'date-fns'
import { Phone, AlertTriangle, CheckCircle, Clock, Zap, Package, Flag, ChevronDown, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    updateBookingStatus,
    rejectWithReason,
    emergencyEndSession,
    endSession,
    reportLostEquipment,
    reportStudentPostSession,
    expireBooking,
} from '@/actions/manager'
import { useRouter } from 'next/navigation'

// ΓöÇΓöÇΓöÇ Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
interface Player {
    id: string
    full_name: string
    student_id?: string
    phone?: string
    email?: string
    is_booker?: boolean
    role?: string
}
interface Equipment {
    id: string
    name: string
    condition?: string
}
interface BookingDetails {
    id: string
    status: string
    start_time: string
    end_time: string
    num_players: number
    equipment_ids?: string[]
    is_priority?: boolean
    is_maintenance?: boolean
    courts: { name: string; sport: string }
    profiles: { id: string; full_name: string; role?: string }
    equipment: Equipment[]
    all_players: Player[]
}

// ΓöÇΓöÇΓöÇ Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function fmt(seconds: number) {
    const abs = Math.abs(seconds)
    const h = Math.floor(abs / 3600)
    const m = Math.floor((abs % 3600) / 60).toString().padStart(2, '0')
    const s = (abs % 60).toString().padStart(2, '0')
    if (h > 0) return `${h}h ${m}m ${s}s`
    return `${m}:${s}`
}

// ΓöÇΓöÇΓöÇ SCREEN: Active Session (big timer + emergency) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function ActiveSessionScreen({ booking, onTimerEnd }: { booking: BookingDetails; onTimerEnd: () => void }) {
    const [secondsLeft, setSecondsLeft] = useState(0)
    const [emergencyOpen, setEmergencyOpen] = useState(false)
    const [emergencyReason, setEmergencyReason] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    useEffect(() => {
        const tick = () => {
            const diff = differenceInSeconds(new Date(booking.end_time), new Date())
            setSecondsLeft(diff)
            if (diff <= 0) onTimerEnd()
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [booking.end_time, onTimerEnd])

    const pct = Math.max(0, Math.min(100,
        (secondsLeft / differenceInSeconds(new Date(booking.end_time), new Date(booking.start_time))) * 100
    ))

    const handleEmergency = async () => {
        if (!emergencyReason.trim()) return
        setLoading(true)
        const res = await emergencyEndSession(booking.id, emergencyReason)
        if (res.error) { alert(res.error); setLoading(false); return }
        router.push('/manager')
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-[#004d40] text-white px-4 py-5">
                <p className="text-xs uppercase tracking-widest text-teal-300 mb-1">Active Session</p>
                <h1 className="text-xl font-bold">{booking.courts.name}</h1>
                <p className="text-sm text-teal-200 mt-0.5">{booking.courts.sport}</p>
            </div>

            {/* Timer Circle */}
            <div className="flex flex-col items-center justify-center py-12 bg-white border-b">
                <div className="relative w-48 h-48">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                        <circle
                            cx="60" cy="60" r="54" fill="none"
                            stroke={secondsLeft < 300 ? '#ef4444' : '#004d40'}
                            strokeWidth="8"
                            strokeDasharray={`${2 * Math.PI * 54}`}
                            strokeDashoffset={`${2 * Math.PI * 54 * (1 - pct / 100)}`}
                            strokeLinecap="round"
                            className="transition-all duration-1000"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={cn(
                            "text-4xl font-mono font-bold tabular-nums",
                            secondsLeft < 300 ? 'text-red-600' : 'text-[#004d40]'
                        )}>
                            {fmt(secondsLeft)}
                        </span>
                        <span className="text-xs text-gray-500 mt-1">remaining</span>
                    </div>
                </div>
                <p className="mt-4 text-sm text-gray-500">
                    Ends at {format(new Date(booking.end_time), 'h:mm a')}
                </p>
            </div>

            {/* Players */}
            <div className="px-4 py-5 bg-white border-b space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Players</p>
                {booking.all_players.map(p => (
                    <div key={p.id} className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-gray-900 text-sm">{p.full_name}</p>
                            {p.student_id && <p className="text-xs text-gray-500">Roll: {p.student_id}</p>}
                        </div>
                        {p.phone && (
                            <a href={`tel:${p.phone}`}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#004d40] text-white rounded-lg text-xs font-medium">
                                <Phone className="w-3 h-3" /> Call
                            </a>
                        )}
                    </div>
                ))}
            </div>

            {/* Back + Emergency */}
            <div className="px-4 py-5 mt-auto space-y-3">
                <button
                    onClick={() => router.push('/manager')}
                    className="w-full py-3 border-2 border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-2 transition"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Manager Home
                </button>

                {!emergencyOpen ? (
                    <button
                        onClick={() => setEmergencyOpen(true)}
                        className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
                    >
                        <Zap className="w-5 h-5" />
                        Emergency End Session
                    </button>
                ) : (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2 text-red-700 font-bold">
                            <Zap className="w-4 h-4" />
                            Emergency Stop ΓÇö Reason Required
                        </div>
                        <textarea
                            className="w-full border border-red-200 rounded-lg p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                            rows={3}
                            placeholder="Describe the emergency reason..."
                            value={emergencyReason}
                            onChange={(e) => setEmergencyReason(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => setEmergencyOpen(false)}
                                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleEmergency}
                                disabled={!emergencyReason.trim() || loading}
                                className="flex-1 py-2.5 bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold"
                            >
                                {loading ? 'StoppingΓÇª' : 'Confirm Emergency Stop'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ΓöÇΓöÇΓöÇ SCREEN: Post-Session ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function PostSessionScreen({ booking }: { booking: BookingDetails }) {
    const router = useRouter()
    const [equipConds, setEquipConds] = useState<Record<string, 'good' | 'minor_damage' | 'damaged' | 'lost'>>(
        Object.fromEntries(booking.equipment.map(e => [e.id, 'good']))
    )
    const [starRatings, setStarRatings] = useState<Record<string, number>>(
        Object.fromEntries(booking.all_players.map(p => [p.id, 5]))
    )
    const [loading, setLoading] = useState(false)

    // Report student modal state
    const [reportModal, setReportModal] = useState(false)
    const [selectedStudent, setSelectedStudent] = useState('')
    const [reportReason, setReportReason] = useState('')
    const [reportCustom, setReportCustom] = useState('')

    const isAdminBooking = booking.is_priority || booking.is_maintenance

    const studentPlayers = booking.all_players.filter(p => p.role === 'student' || (!isAdminBooking && p.role !== 'admin' && p.role !== 'manager'))
    const allPlayerIds = booking.all_players.map(p => p.id)

    const handleEndSession = async () => {
        setLoading(true)

        // Separate lost items from normal condition items
        const lostIds = booking.equipment
            .filter(e => equipConds[e.id] === 'lost')
            .map(e => e.id)
        const normalConditions = booking.equipment
            .filter(e => equipConds[e.id] !== 'lost')
            .map(e => ({ id: e.id, condition: (equipConds[e.id] || 'good') as 'good' | 'minor_damage' | 'damaged' }))

        // Report lost equipment first (notifies admin, cancels future bookings)
        if (lostIds.length > 0) {
            const lostRes = await reportLostEquipment(booking.id, lostIds, allPlayerIds)
            if ('error' in lostRes && lostRes.error) { alert(lostRes.error); setLoading(false); return }
        }

        // End session with remaining equipment conditions
        const res = await endSession(booking.id, normalConditions)
        if ('error' in res && res.error) { alert(res.error); setLoading(false); return }
        router.push('/manager')
    }

    const handleReportStudent = async () => {
        if (!selectedStudent || !reportReason) return
        setLoading(true)
        const res = await reportStudentPostSession(booking.id, selectedStudent, reportReason, reportCustom || null)
        if ('error' in res && res.error) { alert(res.error) }
        setReportModal(false)
        setSelectedStudent('')
        setReportReason('')
        setReportCustom('')
        setLoading(false)
    }

    const REPORT_REASONS = [
        { value: 'inappropriate_behaviour', label: 'Inappropriate Behaviour' },
        { value: 'vandalism', label: 'Vandalism / Property Damage' },
        { value: 'late_end', label: 'Did Not Finish Booking on Time' },
        { value: 'other', label: 'Other' },
    ]

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            {/* Header */}
            <div className="bg-[#004d40] text-white px-4 py-5">
                <p className="text-xs uppercase tracking-widest text-teal-300 mb-1">Session Ended</p>
                <h1 className="text-xl font-bold">{booking.courts.name}</h1>
                <p className="text-sm text-teal-200">{booking.courts.sport}</p>
            </div>

            {/* Session Info */}
            <div className="mx-4 mt-4 bg-white rounded-xl border p-4 flex items-center gap-2 text-gray-500">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm">
                    Session completed ┬╖ {format(new Date(booking.start_time), 'h:mm a')} ΓÇô {format(new Date(booking.end_time), 'h:mm a')}
                </span>
            </div>

            {/* Players */}
            <div className="mx-4 mt-4 bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Involved Students</p>
                </div>
                {booking.all_players.map((p, idx) => (
                    <div key={p.id} className={cn('px-4 py-4', idx > 0 && 'border-t')}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm">{p.full_name}</p>
                                {p.student_id && <p className="text-xs text-gray-500">Roll: {p.student_id}</p>}
                                {p.phone && <p className="text-xs text-gray-500">Phone: {p.phone}</p>}
                                {p.phone && (
                                    <a href={`tel:${p.phone}`}
                                        className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 bg-[#004d40] text-white rounded-lg text-xs">
                                        <Phone className="w-3 h-3" /> Call
                                    </a>
                                )}
                            </div>
                            {/* Star rating */}
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                        key={star}
                                        onClick={() => setStarRatings(prev => ({ ...prev, [p.id]: star }))}
                                        className="p-0.5 focus:outline-none"
                                        aria-label={`Rate ${star} stars`}
                                    >
                                        <svg
                                            className={cn('w-5 h-5 transition-colors', star <= (starRatings[p.id] ?? 5) ? 'text-amber-500' : 'text-gray-300')}
                                            fill="currentColor" viewBox="0 0 20 20"
                                        >
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Equipment Condition */}
            {booking.equipment.length > 0 && (
                <div className="mx-4 mt-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1">Equipment List</p>
                    {booking.equipment.map(eq => (
                        <div key={eq.id} className={cn('bg-white rounded-xl border p-4', equipConds[eq.id] === 'lost' && 'border-red-300 bg-red-50/50')}>
                            <p className="font-semibold text-gray-900 mb-3">{eq.name}</p>
                            <p className="text-xs text-gray-500 mb-2">Select Condition:</p>
                            <div className="grid grid-cols-4 gap-1.5">
                                {(['good', 'minor_damage', 'damaged', 'lost'] as const).map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setEquipConds(prev => ({ ...prev, [eq.id]: c }))}
                                        className={cn(
                                            'py-2 rounded-lg text-xs font-bold uppercase tracking-wide border transition',
                                            equipConds[eq.id] === c
                                                ? c === 'good' ? 'bg-[#004d40] text-white border-[#004d40]'
                                                    : c === 'minor_damage' ? 'bg-amber-500 text-white border-amber-500'
                                                        : c === 'damaged' ? 'bg-red-600 text-white border-red-600'
                                                            : 'bg-red-800 text-white border-red-800'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        )}
                                    >
                                        {c === 'minor_damage' ? 'Minor' : c === 'good' ? 'Good' : c === 'damaged' ? 'Damaged' : 'Lost'}
                                    </button>
                                ))}
                            </div>
                            {equipConds[eq.id] === 'lost' && (
                                <p className="text-xs text-red-600 mt-2 font-medium">ΓÜá Admin will be notified. This item will be removed from future bookings.</p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Action Buttons */}
            <div className="mx-4 mt-6 space-y-3">

                {/* Report Student */}
                {(studentPlayers.length > 0 || isAdminBooking) && (
                    <button
                        onClick={() => setReportModal(true)}
                        className="w-full py-3.5 border border-gray-200 bg-white text-[#004d40] rounded-xl flex items-center justify-center gap-2 font-semibold text-sm hover:bg-gray-50 transition"
                    >
                        <Flag className="w-4 h-4" />
                        Report Student(s)
                    </button>
                )}

                {/* End Session */}
                <button
                    onClick={handleEndSession}
                    disabled={loading}
                    className="w-full py-4 bg-[#004d40] hover:bg-[#00695c] disabled:opacity-60 text-white rounded-xl font-bold text-base transition"
                >
                    {loading ? 'Ending SessionΓÇª' : 'End Session'}
                </button>
            </div>



            {/* Report Student Modal */}
            {reportModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
                    <div className="bg-white w-full rounded-t-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Flag className="w-4 h-4 text-amber-600" />
                            Report Student
                        </h3>

                        {/* Student selector */}
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Select Student</p>
                            <div className="space-y-2">
                                {(isAdminBooking ? booking.all_players : studentPlayers).map(p => (
                                    <label key={p.id} className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input
                                            type="radio"
                                            name="student"
                                            value={p.id}
                                            checked={selectedStudent === p.id}
                                            onChange={() => setSelectedStudent(p.id)}
                                            className="w-4 h-4 accent-[#004d40]"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{p.full_name}</p>
                                            {p.student_id && <p className="text-xs text-gray-500">{p.student_id}</p>}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Reason selector */}
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Reason</p>
                            <div className="space-y-2">
                                {REPORT_REASONS.map(r => (
                                    <label key={r.value} className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input
                                            type="radio"
                                            name="reason"
                                            value={r.value}
                                            checked={reportReason === r.value}
                                            onChange={() => setReportReason(r.value)}
                                            className="w-4 h-4 accent-[#004d40]"
                                        />
                                        <span className="text-sm text-gray-800">{r.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {reportReason === 'other' && (
                            <textarea
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                rows={2}
                                placeholder="Describe the issue..."
                                value={reportCustom}
                                onChange={(e) => setReportCustom(e.target.value)}
                            />
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setReportModal(false)}
                                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">
                                Cancel
                            </button>
                            <button
                                onClick={handleReportStudent}
                                disabled={!selectedStudent || !reportReason || loading}
                                className="flex-1 py-3 bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold">
                                Issue Warning
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ΓöÇΓöÇΓöÇ MAIN EXPORT ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export function ManagerApprovalScreen({ booking }: { booking: BookingDetails }) {
    const router = useRouter()
    const [currentTime, setCurrentTime] = useState(new Date())
    const [sessionActive, setSessionActive] = useState(booking.status === 'active')
    const [sessionEnded, setSessionEnded] = useState(booking.status === 'completed')
    const [loading, setLoading] = useState(false)
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [rejectCustom, setRejectCustom] = useState('')

    useEffect(() => {
        const id = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(id)
    }, [])

    const startTime = new Date(booking.start_time)
    const endTime = new Date(booking.end_time)
    const expirationTime = new Date(startTime.getTime() + 10 * 60 * 1000)

    const secondsToStart = differenceInSeconds(startTime, currentTime)
    const secondsToExpiration = differenceInSeconds(expirationTime, currentTime)

    const isUpcoming = secondsToStart > 0
    const isExpired = !['active', 'completed', 'cancelled', 'rejected'].includes(booking.status) && secondsToExpiration < 0
    const canAccept = secondsToStart <= 0 && !isExpired && booking.status !== 'cancelled' && booking.status !== 'rejected'

    // ── EXPIRED STATE: auto-cancel + issue violations ─────────────────────────
    // IMPORTANT: hooks must be above ALL early returns
    const expireCalledRef = useRef(false)
    useEffect(() => {
        if (isExpired && !expireCalledRef.current) {
            expireCalledRef.current = true
            const allPlayerIds = booking.all_players.map(p => p.id)
            expireBooking(booking.id, allPlayerIds)
        }
    }, [isExpired, booking.id, booking.all_players])

    // Show active session screen
    if (sessionActive) {
        return (
            <ActiveSessionScreen
                booking={booking}
                onTimerEnd={() => { setSessionActive(false); setSessionEnded(true) }}
            />
        )
    }

    // Show post-session screen
    if (sessionEnded) {
        return <PostSessionScreen booking={booking} />
    }

    // ΓöÇΓöÇ REJECT_REASONS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    const REJECT_REASONS = [
        { value: 'students_late', label: 'Students arrived late' },
        { value: 'inappropriate_behaviour', label: 'Inappropriate behaviour' },
        { value: 'improper_gear', label: 'Improper gear/equipment' },
        { value: 'other', label: 'Other' },
    ]

    const handleAccept = async () => {
        setLoading(true)
        try {
            const result = await updateBookingStatus(booking.id, 'active')
            if (result?.error) {
                console.error('Accept error:', result.error)
                alert('Error accepting: ' + result.error)
                setLoading(false)
                return
            }
            setSessionActive(true)
        } catch (err) {
            console.error('Accept error:', err)
            alert('Something went wrong. Please try again.')
        }
        setLoading(false)
    }

    const handleReject = async () => {
        if (!rejectReason) return
        setLoading(true)
        const allPlayerIds = booking.all_players.map(p => p.id)
        await rejectWithReason(booking.id, rejectReason, rejectCustom || null, allPlayerIds)
        router.push('/manager')
    }

    const isAdminBooking = booking.is_priority || booking.is_maintenance

    if (isExpired) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="bg-red-700 text-white px-4 py-5">
                    <p className="text-xs uppercase tracking-widest text-red-200 mb-1">Auto Cancelled</p>
                    <h1 className="text-xl font-bold">{booking.courts.name}</h1>
                </div>
                <div className="mx-4 mt-8 bg-white rounded-xl border border-red-100 p-6 text-center space-y-3">
                    <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
                    <h2 className="font-bold text-gray-900">Booking Expired</h2>
                    <p className="text-sm text-gray-600">This booking was not approved within 10 minutes of the start time and has been auto-cancelled. A penalty has been issued to all involved students.</p>
                </div>
                <div className="mx-4 mt-4">
                    <button onClick={() => router.push('/manager')} className="w-full py-3 bg-[#004d40] text-white rounded-xl font-semibold">
                        Back to Dashboard
                    </button>
                </div>
            </div>
        )
    }

    // ΓöÇΓöÇ CANCELLED/REJECTED ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="bg-gray-700 text-white px-4 py-5">
                    <p className="text-xs uppercase tracking-widest text-gray-300 mb-1">
                        {booking.status === 'cancelled' ? 'Cancelled' : 'Rejected'}
                    </p>
                    <h1 className="text-xl font-bold">{booking.courts.name}</h1>
                </div>
                <div className="mx-4 mt-8 bg-white rounded-xl border p-6 text-center space-y-3">
                    <p className="text-sm text-gray-600">This booking has been {booking.status}.</p>
                </div>
                <div className="mx-4 mt-4">
                    <button onClick={() => router.push('/manager')} className="w-full py-3 bg-[#004d40] text-white rounded-xl font-semibold">
                        Back to Dashboard
                    </button>
                </div>
            </div>
        )
    }

    // ΓöÇΓöÇ PENDING APPROVAL ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            {/* Header */}
            <div className="bg-[#004d40] text-white px-4 py-5">
                <p className="text-xs uppercase tracking-widest text-teal-300 mb-1">Pending Approval</p>
                <h1 className="text-xl font-bold">{booking.courts.name}</h1>
                <p className="text-sm text-teal-200">{booking.courts.sport}</p>
            </div>

            {/* Timer */}
            <div className="mx-4 mt-4 bg-white rounded-xl border p-4 flex items-center gap-3">
                <Clock className={cn('w-5 h-5', isUpcoming ? 'text-amber-500' : 'text-green-600')} />
                <div>
                    <p className="text-xs text-gray-500">{isUpcoming ? 'Session starts in' : 'Started - awaiting approval'}</p>
                    {isUpcoming ? (
                        <p className="text-xl font-mono font-bold text-[#004d40]">{fmt(secondsToStart)}</p>
                    ) : (
                        <p className="text-sm font-semibold text-green-700">Ready to accept now</p>
                    )}
                </div>
            </div>

            {/* Booking Info */}
            <div className="mx-4 mt-4 bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Booking Details</p>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Time</span>
                        <span className="font-medium text-gray-900">
                            {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Players</span>
                        <span className="font-medium text-gray-900">{booking.num_players}</span>
                    </div>
                    {booking.equipment.length > 0 && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Equipment</span>
                            <span className="font-medium text-gray-900 text-right max-w-[55%]">
                                {booking.equipment.map(e => e.name).join(', ')}
                            </span>
                        </div>
                    )}
                    {isAdminBooking && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Type</span>
                            <span className={cn(
                                'font-bold text-xs px-2 py-0.5 rounded-full',
                                booking.is_maintenance ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                            )}>
                                {booking.is_maintenance ? 'Maintenance' : 'Priority'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Players */}
            <div className="mx-4 mt-4 bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                        {isAdminBooking ? 'Booked By' : 'Involved Students'}
                    </p>
                </div>
                {isAdminBooking ? (
                    <div className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{booking.profiles.full_name}</p>
                        <p className="text-xs text-gray-500">Administrator</p>
                    </div>
                ) : (
                    booking.all_players.map((p, idx) => (
                        <div key={p.id} className={cn('px-4 py-3 flex items-center justify-between', idx > 0 && 'border-t')}>
                            <div>
                                <p className="font-semibold text-gray-900 text-sm">{p.full_name}</p>
                                {p.student_id && <p className="text-xs text-gray-500">Roll: {p.student_id}</p>}
                                {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                            </div>
                            {p.phone && (
                                <a href={`tel:${p.phone}`}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#004d40] text-white rounded-lg text-xs">
                                    <Phone className="w-3 h-3" /> Call
                                </a>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Action Buttons */}
            <div className="mx-4 mt-6 space-y-3">
                <button
                    onClick={handleAccept}
                    disabled={!canAccept || loading}
                    className={cn(
                        'w-full py-4 rounded-xl font-bold text-base transition',
                        canAccept
                            ? 'bg-[#004d40] hover:bg-[#00695c] text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    )}
                >
                    {isUpcoming ? `Accept Play (starts in ${fmt(secondsToStart)})` : loading ? 'Starting...' : 'Accept Play'}
                </button>

                <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={loading}
                    className="w-full py-3.5 border border-red-200 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-50 transition"
                >
                    Reject / Cancel Booking
                </button>
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
                    <div className="bg-white w-full rounded-t-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                        <h3 className="font-bold text-gray-900">Reject / Cancel Booking</h3>
                        <p className="text-sm text-gray-500">Select a reason. A warning will be issued to all involved students.</p>

                        <div className="space-y-2">
                            {REJECT_REASONS.map(r => (
                                <label key={r.value} className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
                                    <input
                                        type="radio"
                                        name="reject_reason"
                                        value={r.value}
                                        checked={rejectReason === r.value}
                                        onChange={() => setRejectReason(r.value)}
                                        className="w-4 h-4 accent-red-600"
                                    />
                                    <span className="text-sm text-gray-800">{r.label}</span>
                                </label>
                            ))}
                        </div>

                        {rejectReason === 'other' && (
                            <textarea
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                                rows={2}
                                placeholder="Describe the reason..."
                                value={rejectCustom}
                                onChange={(e) => setRejectCustom(e.target.value)}
                            />
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setShowRejectModal(false)}
                                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!rejectReason || loading}
                                className="flex-1 py-3 bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold">
                                {loading ? 'ProcessingΓÇª' : 'Confirm Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
