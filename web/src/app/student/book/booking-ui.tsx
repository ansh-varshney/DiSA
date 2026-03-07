'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createBooking, getBookingsForDateRange, getAvailableEquipment, searchStudents } from '@/actions/bookings'
import { getPlayerLimits } from '@/lib/sport-config'
import { Loader2, CheckCircle, Clock, Users, Package, X, Search, UserPlus, ChevronRight } from 'lucide-react'
import React from 'react'

type Court = { id: string; name: string; sport: string }
type Booking = { id: string; court_id: string; start_time: string; end_time: string; status: string; user_id: string; profiles?: { full_name: string }; num_players?: number }
type Equipment = { id: string; name: string; sport: string; condition: string; in_use?: boolean }
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
    // Get unique sports from courts (normalize to lowercase)
    const sports = useMemo(() => {
        const set = new Set(initialCourts.map(c => c.sport.toLowerCase().trim()))
        return Array.from(set).sort()
    }, [initialCourts])

    const [selectedSport, setSelectedSport] = useState('')
    const [selectedDate, setSelectedDate] = useState('')
    const [bookings, setBookings] = useState<Booking[]>([])
    const [loadingBookings, setLoadingBookings] = useState(false)
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

    const allTimeSlots = generateTimeSlots()

    // Courts for selected sport
    const filteredCourts = useMemo(() => {
        if (!selectedSport) return []
        return initialCourts.filter(c => c.sport.toLowerCase().trim() === selectedSport)
    }, [initialCourts, selectedSport])

    // Filter out past time slots
    const visibleTimeSlots = useMemo(() => {
        if (!selectedDate) return allTimeSlots
        const selected = new Date(selectedDate)
        const now = new Date()
        const isToday = selected.toDateString() === now.toDateString()
        if (!isToday) return allTimeSlots
        // Only show slots that haven't passed yet
        return allTimeSlots.filter(time => {
            const [hour, minute] = time.split(':').map(Number)
            const slotDate = new Date()
            slotDate.setHours(hour, minute, 0, 0)
            return slotDate > now
        })
    }, [selectedDate, allTimeSlots])

    // ─── Data fetching ───────────────────────────────────────────────────────
    const fetchBookings = async (dateStr: string) => {
        if (!dateStr || filteredCourts.length === 0) return
        setLoadingBookings(true)
        try {
            const date = new Date(dateStr)
            const allBookings: Booking[] = []
            for (const court of filteredCourts) {
                const data = await getBookingsForDateRange(court.id, date, addDays(date, 1))
                allBookings.push(...(data as Booking[]))
            }
            setBookings(allBookings)
        } finally {
            setLoadingBookings(false)
        }
    }

    useEffect(() => {
        if (selectedDate && filteredCourts.length > 0) {
            fetchBookings(selectedDate)
        }
    }, [selectedDate, selectedSport])

    // Fetch equipment when slot is selected
    const selectedCourtId = selectedSlot?.courtId ?? null
    const selectedTime = selectedSlot?.time ?? null
    useEffect(() => {
        if (selectedCourtId && selectedSport && selectedTime && selectedDate) {
            setLoadingEquipment(true)
            setAvailableEquipment([])
            // Compute start/end ISO for the selected slot + duration
            const [h, m] = selectedTime.split(':').map(Number)
            const start = new Date(selectedDate)
            start.setHours(h, m, 0, 0)
            const end = new Date(start.getTime() + duration * 60 * 1000)
            getAvailableEquipment(selectedSport, start.toISOString(), end.toISOString()).then(eq => {
                setAvailableEquipment(eq)
                setLoadingEquipment(false)
            }).catch(() => setLoadingEquipment(false))
        }
    }, [selectedCourtId, selectedSport, selectedTime, selectedDate, duration])

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
    const getBookingForSlot = (courtId: string, slotTime: string): Booking | undefined => {
        const [slotH, slotM] = slotTime.split(':').map(Number)
        const slotDate = new Date(selectedDate)
        slotDate.setHours(slotH, slotM, 0, 0)
        const slotMs = slotDate.getTime()

        return bookings.find(b => {
            if (b.court_id !== courtId) return false
            const bStart = new Date(b.start_time).getTime()
            const bEnd = new Date(b.end_time).getTime()
            // Slot is within the booking range
            return slotMs >= bStart && slotMs < bEnd
        })
    }

    const handleSlotClick = (court: Court, time: string) => {
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
        if (!selectedSlot || !selectedDate) return

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
                    status: 'confirmed'
                }))
                formData.append('playersList', JSON.stringify(playersList))
            }

            const result = await createBooking(null, formData)
            if (result?.error) {
                setMessage({ text: result.error, type: 'error' })
            } else {
                setMessage({ text: 'Slot booked successfully!', type: 'success' })
                setSelectedSlot(null)
                fetchBookings(selectedDate)
            }
        })
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const maxDateStr = format(addDays(new Date(), 3), 'yyyy-MM-dd')

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="space-y-4">
            {/* Filters: Sport dropdown + Date picker */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-semibold text-gray-900">Sport:</label>
                            <select
                                value={selectedSport}
                                onChange={(e) => {
                                    setSelectedSport(e.target.value)
                                    setSelectedSlot(null)
                                    setBookings([])
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                            >
                                <option value="">Select Sport</option>
                                {sports.map(s => (
                                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                ))}
                            </select>
                        </div>

                        {selectedSport && (
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-semibold text-gray-900">Date:</label>
                                <input
                                    type="date"
                                    min={todayStr}
                                    max={maxDateStr}
                                    value={selectedDate}
                                    onChange={(e) => {
                                        setSelectedDate(e.target.value)
                                        setSelectedSlot(null)
                                    }}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                />
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Prompt states */}
            {!selectedSport ? (
                <Card>
                    <CardContent className="p-12">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                                <Package className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">Select a Sport</h3>
                            <p className="text-gray-500 text-sm max-w-md mx-auto">Choose a sport from the dropdown above to see available courts and time slots.</p>
                        </div>
                    </CardContent>
                </Card>
            ) : !selectedDate ? (
                <Card>
                    <CardContent className="p-12">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                                <Clock className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">Select a Date</h3>
                            <p className="text-gray-500 text-sm max-w-md mx-auto">Choose a date to view available slots for {selectedSport} courts.</p>
                        </div>
                    </CardContent>
                </Card>
            ) : loadingBookings ? (
                <div className="flex items-center justify-center p-16">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : filteredCourts.length === 0 ? (
                <Card>
                    <CardContent className="p-12 text-center text-gray-500">
                        No courts available for {selectedSport}.
                    </CardContent>
                </Card>
            ) : visibleTimeSlots.length === 0 ? (
                <Card>
                    <CardContent className="p-12 text-center text-gray-500">
                        No more available slots for today. Try selecting tomorrow.
                    </CardContent>
                </Card>
            ) : (
                /* Calendar Grid */
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <div className="inline-block min-w-full">
                                <div className="grid" style={{ gridTemplateColumns: `72px repeat(${filteredCourts.length}, minmax(120px, 1fr))` }}>
                                    {/* Header Row */}
                                    <div className="sticky top-0 left-0 z-20 bg-[#004d40] border-b border-r border-[#003d33] p-2">
                                        <span className="text-[10px] font-bold text-white/70 uppercase">Time</span>
                                    </div>
                                    {filteredCourts.map(court => (
                                        <div key={court.id} className="sticky top-0 z-10 bg-[#004d40] border-b border-r border-[#003d33] p-2">
                                            <div className="font-semibold text-xs text-white">{court.name}</div>
                                        </div>
                                    ))}

                                    {/* Only future time slots */}
                                    {visibleTimeSlots.map(time => (
                                        <React.Fragment key={time}>
                                            <div className="sticky left-0 z-10 bg-gray-50 border-r border-b border-gray-200 p-1.5 text-[11px] text-gray-500 font-medium flex items-center">
                                                {formatTime(time)}
                                            </div>

                                            {filteredCourts.map(court => {
                                                const booking = getBookingForSlot(court.id, time)
                                                const isBooked = !!booking
                                                const isSelected = selectedSlot?.courtId === court.id && selectedSlot?.time === time

                                                return (
                                                    <div
                                                        key={`${court.id}-${time}`}
                                                        onClick={() => handleSlotClick(court, time)}
                                                        className={cn(
                                                            "border-r border-b border-gray-200 p-1.5 min-h-[44px] transition-all text-xs",
                                                            isSelected
                                                                ? "bg-[#004d40] text-white ring-2 ring-[#004d40] ring-offset-1"
                                                                : isBooked
                                                                    ? "bg-blue-50 border-l-[3px] border-l-blue-500 cursor-default"
                                                                    : "bg-white hover:bg-[#004d40]/5 cursor-pointer"
                                                        )}
                                                    >
                                                        {isSelected ? (
                                                            <span className="text-[10px] font-bold">✓ Selected</span>
                                                        ) : booking ? (
                                                            <div>
                                                                <div className="font-semibold text-blue-700 text-[11px]">Booked</div>
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
                                <p className="text-sm text-gray-500">{selectedDate} · {formatTime(selectedSlot.time)}</p>
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
                            {(() => {
                                const limits = getPlayerLimits(selectedSport)
                                const totalPlayers = selectedPlayers.length + 1
                                const atMax = limits.max ? totalPlayers >= limits.max : false
                                return (
                                    <>
                                        <label className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase mb-1.5">
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3 h-3" /> Players ({totalPlayers}{limits.max ? `/${limits.max}` : ''})
                                            </span>
                                            {!atMax && (
                                                <button
                                                    onClick={() => setPlayerSearch(playerSearch ? '' : ' ')}
                                                    className="flex items-center gap-1 text-[#004d40] text-xs font-bold normal-case"
                                                >
                                                    <UserPlus className="w-3.5 h-3.5" /> Add
                                                </button>
                                            )}
                                            {atMax && (
                                                <span className="text-[10px] text-orange-500 font-semibold normal-case">Max reached</span>
                                            )}
                                        </label>
                                        {totalPlayers < limits.min && (
                                            <p className="text-[11px] text-red-500 mb-1">Minimum {limits.min} players required</p>
                                        )}
                                    </>
                                )
                            })()}
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
                                            className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004d40] placeholder:text-gray-400"
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
                        <div>
                            <label className="flex items-center gap-1 text-xs font-bold text-gray-500 uppercase mb-1.5">
                                <Package className="w-3 h-3" /> Equipment
                            </label>
                            {loadingEquipment ? (
                                <p className="text-xs text-gray-400">Loading equipment...</p>
                            ) : availableEquipment.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {availableEquipment.map(eq => (
                                        <button
                                            key={eq.id}
                                            onClick={() => !eq.in_use && setSelectedEquipment(prev =>
                                                prev.includes(eq.id) ? prev.filter(id => id !== eq.id) : [...prev, eq.id]
                                            )}
                                            disabled={eq.in_use}
                                            className={cn(
                                                "px-2.5 py-1 text-xs rounded-full border transition-all",
                                                eq.in_use
                                                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                                                    : selectedEquipment.includes(eq.id)
                                                        ? "bg-[#004d40] text-white border-[#004d40]"
                                                        : "bg-white text-gray-600 border-gray-200 hover:border-[#004d40]"
                                            )}
                                        >
                                            {eq.name} {eq.in_use ? '(In Use)' : selectedEquipment.includes(eq.id) && '✓'}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400">No equipment available</p>
                            )}
                        </div>

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
