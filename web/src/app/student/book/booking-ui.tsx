'use client'

import { useState, useTransition, useEffect } from 'react'
import { startOfDay, addDays, format, addMinutes } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createBooking, getBookingsForDateRange, getAvailableEquipment, searchStudents } from '@/actions/bookings'
import { Loader2, CheckCircle, Clock, Users, Package, X, Search, UserPlus, ChevronRight } from 'lucide-react'
import React from 'react'

type Court = { id: string; name: string; sport: string }
type Booking = { id: string; court_id: string; start_time: string; end_time: string; status: string; user_id: string; profiles?: { full_name: string }; num_players?: number }
type Equipment = { id: string; name: string; sport: string; condition: string }
type Player = { id: string; full_name: string; student_id: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const generateTimeSlots = () => {
    const slots: string[] = []
    for (let hour = 6; hour <= 22; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
            if (hour === 22 && minute > 0) break
            slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)
        }
    }
    return slots
}

const formatTime = (time: string) => {
    const [hour, minute] = time.split(':').map(Number)
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function BookingUI({ initialCourts }: { initialCourts: Court[] }) {
    const [bookings, setBookings] = useState<Booking[]>([])
    const [loadingBookings, setLoadingBookings] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [isPending, startTransition] = useTransition()
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

    // Booking dialog state
    const [selectedSlot, setSelectedSlot] = useState<{ courtId: string; courtName: string; time: string } | null>(null)
    const [duration, setDuration] = useState<30 | 60>(30)
    const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([])
    const [playerSearch, setPlayerSearch] = useState('')
    const [searchResults, setSearchResults] = useState<Player[]>([])
    const [searchingPlayers, setSearchingPlayers] = useState(false)
    const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([])
    const [selectedEquipment, setSelectedEquipment] = useState<string[]>([])
    const [loadingEquipment, setLoadingEquipment] = useState(false)

    const today = startOfDay(new Date())
    const days = [0, 1, 2, 3].map(offset => addDays(today, offset))
    const timeSlots = generateTimeSlots()

    // ─── Data fetching ───────────────────────────────────────────────────────
    const fetchBookings = async (date: Date) => {
        setLoadingBookings(true)
        try {
            // Fetch bookings for ALL courts on this date
            const allBookings: Booking[] = []
            for (const court of initialCourts) {
                const data = await getBookingsForDateRange(court.id, date, addDays(date, 1))
                allBookings.push(...(data as Booking[]))
            }
            setBookings(allBookings)
        } finally {
            setLoadingBookings(false)
        }
    }

    useEffect(() => {
        fetchBookings(selectedDate)
    }, [selectedDate])

    // Fetch equipment when slot is selected
    useEffect(() => {
        if (selectedSlot) {
            const court = initialCourts.find(c => c.id === selectedSlot.courtId)
            if (court) {
                setLoadingEquipment(true)
                getAvailableEquipment(court.sport).then(eq => {
                    setAvailableEquipment(eq)
                    setLoadingEquipment(false)
                })
            }
        }
    }, [selectedSlot?.courtId])

    // Debounced player search
    useEffect(() => {
        if (playerSearch.length < 2) {
            setSearchResults([])
            return
        }
        const timer = setTimeout(async () => {
            setSearchingPlayers(true)
            const results = await searchStudents(playerSearch)
            setSearchResults(results.filter(r => !selectedPlayers.some(p => p.id === r.id)))
            setSearchingPlayers(false)
        }, 300)
        return () => clearTimeout(timer)
    }, [playerSearch, selectedPlayers])

    // ─── Slot helpers ────────────────────────────────────────────────────────
    const isSlotInPast = (slotTime: string): boolean => {
        const now = new Date()
        const isToday = selectedDate.toDateString() === now.toDateString()
        if (!isToday) return false
        const [hour, minute] = slotTime.split(':').map(Number)
        const slotDate = new Date(selectedDate)
        slotDate.setHours(hour, minute, 0, 0)
        return slotDate <= now
    }

    const getBookingForSlot = (courtId: string, slotTime: string): Booking | undefined => {
        return bookings.find(b => {
            if (b.court_id !== courtId) return false
            const startStr = new Date(b.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
            return startStr === slotTime
        })
    }

    const handleSlotClick = (court: Court, time: string) => {
        if (isSlotInPast(time)) return
        const booking = getBookingForSlot(court.id, time)
        if (booking) return // Can't book occupied slot

        setSelectedSlot({ courtId: court.id, courtName: court.name, time })
        setDuration(30)
        setSelectedPlayers([])
        setSelectedEquipment([])
        setPlayerSearch('')
        setMessage(null)
    }

    const handleBook = async () => {
        if (!selectedSlot) return

        const [hour, minute] = selectedSlot.time.split(':').map(Number)
        const startTime = new Date(selectedDate)
        startTime.setHours(hour, minute, 0, 0)

        startTransition(async () => {
            const formData = new FormData()
            formData.append('courtId', selectedSlot.courtId)
            formData.append('startTime', startTime.toISOString())
            formData.append('duration', duration.toString())
            formData.append('numPlayers', (selectedPlayers.length + 1).toString())
            if (selectedEquipment.length > 0) {
                formData.append('equipmentIds', JSON.stringify(selectedEquipment))
            }
            if (selectedPlayers.length > 0) {
                const playersList = selectedPlayers.map(p => ({
                    id: p.id,
                    full_name: p.full_name,
                    student_id: p.student_id,
                    status: 'pending'
                }))
                formData.append('playersList', JSON.stringify(playersList))
            }

            const result = await createBooking(null, formData)
            if (result?.error) {
                setMessage({ text: result.error, type: 'error' })
            } else {
                setMessage({ text: 'Booking request sent!', type: 'success' })
                setSelectedSlot(null)
                fetchBookings(selectedDate)
            }
        })
    }

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="space-y-4">
            {/* Date Selector */}
            <div className="grid grid-cols-4 gap-2 text-center bg-white p-2 rounded-lg border">
                {days.map(d => (
                    <div
                        key={d.toString()}
                        onClick={() => { setSelectedDate(d); setSelectedSlot(null) }}
                        className={cn(
                            "p-2 rounded cursor-pointer transition-colors",
                            selectedDate.toDateString() === d.toDateString()
                                ? "bg-[#004d40] text-white"
                                : "hover:bg-gray-100"
                        )}
                    >
                        <div className="text-xs font-medium uppercase">{format(d, 'EEE')}</div>
                        <div className="text-lg font-bold">{format(d, 'd')}</div>
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            {loadingBookings ? (
                <div className="flex items-center justify-center p-16">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <div className="inline-block min-w-full">
                                <div className="grid" style={{ gridTemplateColumns: `72px repeat(${initialCourts.length}, minmax(120px, 1fr))` }}>
                                    {/* Header Row */}
                                    <div className="sticky top-0 left-0 z-20 bg-[#004d40] border-b border-r border-[#003d33] p-2">
                                        <span className="text-[10px] font-bold text-white/70 uppercase">Time</span>
                                    </div>
                                    {initialCourts.map(court => (
                                        <div key={court.id} className="sticky top-0 z-10 bg-[#004d40] border-b border-r border-[#003d33] p-2">
                                            <div className="font-semibold text-xs text-white">{court.name}</div>
                                            <div className="text-[10px] text-white/60">{court.sport}</div>
                                        </div>
                                    ))}

                                    {/* Time Slots */}
                                    {timeSlots.map(time => (
                                        <React.Fragment key={time}>
                                            <div className="sticky left-0 z-10 bg-gray-50 border-r border-b border-gray-200 p-1.5 text-[11px] text-gray-500 font-medium flex items-center">
                                                {formatTime(time)}
                                            </div>

                                            {initialCourts.map(court => {
                                                const booking = getBookingForSlot(court.id, time)
                                                const isBooked = !!booking
                                                const isPast = isSlotInPast(time)
                                                const isSelected = selectedSlot?.courtId === court.id && selectedSlot?.time === time

                                                return (
                                                    <div
                                                        key={`${court.id}-${time}`}
                                                        onClick={() => handleSlotClick(court, time)}
                                                        className={cn(
                                                            "border-r border-b border-gray-200 p-1.5 min-h-[44px] transition-all text-xs",
                                                            isPast
                                                                ? "bg-gray-100 cursor-not-allowed"
                                                                : isSelected
                                                                    ? "bg-[#004d40] text-white ring-2 ring-[#004d40] ring-offset-1"
                                                                    : isBooked
                                                                        ? "bg-blue-50 border-l-[3px] border-l-blue-500 cursor-default"
                                                                        : "bg-white hover:bg-[#004d40]/5 cursor-pointer"
                                                        )}
                                                    >
                                                        {isPast && !isBooked ? (
                                                            <span className="text-[10px] text-gray-400 italic">—</span>
                                                        ) : isSelected ? (
                                                            <span className="text-[10px] font-bold">✓ Selected</span>
                                                        ) : booking ? (
                                                            <div>
                                                                <div className="font-semibold text-blue-700 text-[11px]">
                                                                    {booking.profiles?.full_name || 'Booked'}
                                                                </div>
                                                                {booking.num_players && (
                                                                    <div className="text-[10px] text-blue-500">
                                                                        {booking.num_players} players
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )
                                            })}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Booking Dialog (slides up from bottom) */}
            {selectedSlot && (
                <div className="fixed bottom-0 left-0 md:left-64 right-0 z-50 bg-white border-t-2 border-[#004d40] shadow-2xl rounded-t-2xl max-h-[70vh] overflow-y-auto animate-in slide-in-from-bottom-4">
                    <div className="p-4 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-900">{selectedSlot.courtName}</h3>
                                <p className="text-sm text-gray-500">{format(selectedDate, 'EEE, MMM d')} · {formatTime(selectedSlot.time)}</p>
                            </div>
                            <button onClick={() => setSelectedSlot(null)} className="p-1 hover:bg-gray-100 rounded-full">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        {/* Duration */}
                        <div>
                            <label className="flex items-center gap-1 text-xs font-bold text-gray-500 uppercase mb-1.5">
                                <Clock className="w-3 h-3" /> Duration
                            </label>
                            <div className="flex gap-2">
                                {([30, 60] as const).map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setDuration(d)}
                                        className={cn(
                                            "flex-1 py-2 text-sm font-bold rounded-lg border transition-all",
                                            duration === d
                                                ? "bg-[#004d40] text-white border-[#004d40]"
                                                : "bg-white text-gray-600 border-gray-200"
                                        )}
                                    >
                                        {d} min
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Players */}
                        <div>
                            <label className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase mb-1.5">
                                <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" /> Players ({selectedPlayers.length + 1})
                                </span>
                                <button
                                    onClick={() => setPlayerSearch(playerSearch ? '' : ' ')}
                                    className="flex items-center gap-1 text-[#004d40] text-xs font-bold normal-case"
                                >
                                    <UserPlus className="w-3.5 h-3.5" /> Add
                                </button>
                            </label>
                            {selectedPlayers.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {selectedPlayers.map(p => (
                                        <span key={p.id} className="flex items-center gap-1 bg-[#004d40]/10 text-[#004d40] px-2 py-1 rounded-full text-xs font-medium">
                                            {p.full_name}
                                            <button onClick={() => setSelectedPlayers(prev => prev.filter(x => x.id !== p.id))}>
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            {playerSearch !== '' && (
                                <div className="relative">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={playerSearch.trim()}
                                            onChange={(e) => setPlayerSearch(e.target.value)}
                                            placeholder="Search by name..."
                                            className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                            autoFocus
                                        />
                                    </div>
                                    {searchResults.length > 0 && (
                                        <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-36 overflow-y-auto">
                                            {searchResults.map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => { setSelectedPlayers(p => [...p, s]); setPlayerSearch(''); setSearchResults([]) }}
                                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between text-sm border-b last:border-0"
                                                >
                                                    <div>
                                                        <p className="font-medium">{s.full_name}</p>
                                                        {s.student_id && <p className="text-xs text-gray-400">Roll: {s.student_id}</p>}
                                                    </div>
                                                    <UserPlus className="w-4 h-4 text-[#004d40]" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Equipment */}
                        {availableEquipment.length > 0 && (
                            <div>
                                <label className="flex items-center gap-1 text-xs font-bold text-gray-500 uppercase mb-1.5">
                                    <Package className="w-3 h-3" /> Equipment
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {availableEquipment.map(eq => (
                                        <button
                                            key={eq.id}
                                            onClick={() => setSelectedEquipment(prev =>
                                                prev.includes(eq.id) ? prev.filter(id => id !== eq.id) : [...prev, eq.id]
                                            )}
                                            className={cn(
                                                "px-2.5 py-1 text-xs rounded-full border transition-all",
                                                selectedEquipment.includes(eq.id)
                                                    ? "bg-[#004d40] text-white border-[#004d40]"
                                                    : "bg-white text-gray-600 border-gray-200"
                                            )}
                                        >
                                            {eq.name} {selectedEquipment.includes(eq.id) && '✓'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Confirm Button */}
                        <button
                            onClick={handleBook}
                            disabled={isPending}
                            className="w-full py-3 bg-[#004d40] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                <>Confirm Booking <ChevronRight className="w-4 h-4" /></>
                            )}
                        </button>

                        {message && (
                            <div className={cn(
                                "p-3 rounded-lg flex items-center gap-2 text-sm",
                                message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            )}>
                                <CheckCircle className="w-4 h-4" />
                                {message.text}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Success/error outside dialog */}
            {message && !selectedSlot && (
                <div className={cn(
                    "p-4 rounded-lg flex items-center gap-2",
                    message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                )}>
                    <CheckCircle className="w-5 h-5" />
                    {message.text}
                </div>
            )}
        </div>
    )
}
