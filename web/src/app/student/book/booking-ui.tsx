'use client'

import { useState, useTransition, useEffect } from 'react'
import { startOfDay, addDays, format, addMinutes, isSameDay } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createBooking, getBookingsForDateRange, getAvailableEquipment } from '@/actions/bookings'
import { Loader2, CheckCircle, Clock, Users, Package, X } from 'lucide-react'

type Court = { id: string; name: string; sport: string }
type Booking = { id: string; start_time: string; end_time: string; status: string }
type Equipment = { id: string; name: string; sport: string; condition: string }

export default function BookingUI({ initialCourts }: { initialCourts: Court[] }) {
    const [selectedCourt, setSelectedCourt] = useState<Court | null>(initialCourts[0] || null)
    const [bookings, setBookings] = useState<Booking[]>([])
    const [loadingBookings, setLoadingBookings] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)
    const [duration, setDuration] = useState<30 | 60>(30)
    const [numPlayers, setNumPlayers] = useState(2)
    const [isPending, startTransition] = useTransition()
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

    // Equipment state
    const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([])
    const [selectedEquipment, setSelectedEquipment] = useState<string[]>([])
    const [loadingEquipment, setLoadingEquipment] = useState(false)

    const today = startOfDay(new Date())
    const days = [0, 1, 2, 3].map(offset => addDays(today, offset))

    // Slot generator (6 AM to 10 PM)
    const generateSlots = (date: Date) => {
        const slots = []
        let start = addMinutes(startOfDay(date), 6 * 60)
        const end = addMinutes(startOfDay(date), 22 * 60)
        while (start < end) {
            slots.push(new Date(start))
            start = addMinutes(start, 30)
        }
        return slots
    }

    // Fetch bookings + equipment when court changes
    const handleCourtChange = async (court: Court) => {
        setSelectedCourt(court)
        setSelectedSlot(null)
        setSelectedEquipment([])
        setMessage(null)

        setLoadingBookings(true)
        try {
            const data = await getBookingsForDateRange(court.id, today, addDays(today, 4))
            setBookings(data as any)
        } finally {
            setLoadingBookings(false)
        }

        setLoadingEquipment(true)
        try {
            const eq = await getAvailableEquipment(court.sport)
            setAvailableEquipment(eq)
        } finally {
            setLoadingEquipment(false)
        }
    }

    // Initial load
    useEffect(() => {
        if (selectedCourt) {
            handleCourtChange(selectedCourt)
        }
    }, [])

    // Check if slot is booked
    const isBooked = (slotTime: Date) => {
        return bookings.some(b => {
            const start = new Date(b.start_time)
            const end = new Date(b.end_time)
            return slotTime >= start && slotTime < end
        })
    }

    // Check if slot + duration would conflict OR if slot is in the past
    const isSlotAvailable = (slotTime: Date) => {
        // Block past slots
        if (slotTime < new Date()) return false

        const slotEnd = addMinutes(slotTime, duration)
        return !bookings.some(b => {
            const start = new Date(b.start_time)
            const end = new Date(b.end_time)
            return slotTime < end && slotEnd > start
        })
    }

    const toggleEquipment = (eqId: string) => {
        setSelectedEquipment(prev =>
            prev.includes(eqId) ? prev.filter(id => id !== eqId) : [...prev, eqId]
        )
    }

    const handleBook = async () => {
        if (!selectedCourt || !selectedSlot) return

        startTransition(async () => {
            const formData = new FormData()
            formData.append('courtId', selectedCourt.id)
            formData.append('startTime', selectedSlot.toISOString())
            formData.append('duration', duration.toString())
            formData.append('numPlayers', numPlayers.toString())
            if (selectedEquipment.length > 0) {
                formData.append('equipmentIds', JSON.stringify(selectedEquipment))
            }

            const result = await createBooking(null, formData)
            if (result?.error) {
                setMessage({ text: result.error, type: 'error' })
            } else {
                setMessage({ text: 'Booking request sent!', type: 'success' })
                handleCourtChange(selectedCourt)
                setSelectedSlot(null)
                setSelectedEquipment([])
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Court Selector */}
            <div className="flex overflow-x-auto gap-2 pb-2">
                {initialCourts.map(court => (
                    <Button
                        key={court.id}
                        variant={selectedCourt?.id === court.id ? 'default' : 'outline'}
                        onClick={() => handleCourtChange(court)}
                        className={cn(
                            "whitespace-nowrap",
                            selectedCourt?.id === court.id && "bg-[#004d40] hover:bg-[#003d33]"
                        )}
                    >
                        {court.name}
                    </Button>
                ))}
            </div>

            {/* Date Selector */}
            <div className="grid grid-cols-4 gap-2 text-center bg-white p-2 rounded-lg border">
                {days.map(d => (
                    <div
                        key={d.toString()}
                        onClick={() => { setSelectedDate(d); setSelectedSlot(null) }}
                        className={cn(
                            "p-2 rounded cursor-pointer transition-colors",
                            isSameDay(selectedDate, d) ? "bg-[#004d40] text-white" : "hover:bg-gray-100"
                        )}
                    >
                        <div className="text-xs font-medium uppercase text-opacity-70">{format(d, 'EEE')}</div>
                        <div className="text-lg font-bold">{format(d, 'd')}</div>
                    </div>
                ))}
            </div>

            {/* Duration Selector + Player Count */}
            <div className="grid grid-cols-2 gap-3">
                <Card>
                    <CardContent className="p-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                            <Clock className="w-3 h-3" /> Duration
                        </label>
                        <div className="flex gap-2">
                            {([30, 60] as const).map(d => (
                                <button
                                    key={d}
                                    onClick={() => { setDuration(d); setSelectedSlot(null) }}
                                    className={cn(
                                        "flex-1 py-2 text-sm font-bold rounded-lg border transition-all",
                                        duration === d
                                            ? "bg-[#004d40] text-white border-[#004d40]"
                                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                                    )}
                                >
                                    {d} min
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                            <Users className="w-3 h-3" /> Players
                        </label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setNumPlayers(Math.max(1, numPlayers - 1))}
                                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                            >
                                −
                            </button>
                            <span className="text-lg font-bold text-gray-800 w-6 text-center">{numPlayers}</span>
                            <button
                                onClick={() => setNumPlayers(Math.min(12, numPlayers + 1))}
                                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                            >
                                +
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Equipment Selector */}
            {availableEquipment.length > 0 && (
                <Card>
                    <CardContent className="p-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                            <Package className="w-3 h-3" /> Equipment (optional)
                        </label>
                        {loadingEquipment ? (
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {availableEquipment.map(eq => {
                                    const isSelected = selectedEquipment.includes(eq.id)
                                    return (
                                        <button
                                            key={eq.id}
                                            onClick={() => toggleEquipment(eq.id)}
                                            className={cn(
                                                "px-3 py-1.5 text-sm rounded-full border transition-all flex items-center gap-1",
                                                isSelected
                                                    ? "bg-[#004d40] text-white border-[#004d40]"
                                                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                                            )}
                                        >
                                            {eq.name}
                                            {isSelected && <X className="w-3 h-3" />}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Time Slots Grid */}
            <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">
                    Available Slots — {format(selectedDate, 'EEE, MMM d')}
                </h3>
                {loadingBookings ? (
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {generateSlots(selectedDate).map((slot, i) => {
                            const available = isSlotAvailable(slot)
                            const selected = selectedSlot && slot.getTime() === selectedSlot.getTime()
                            const isPast = slot < new Date()

                            return (
                                <button
                                    key={i}
                                    disabled={!available}
                                    onClick={() => setSelectedSlot(slot)}
                                    className={cn(
                                        "py-2.5 text-sm rounded-lg transition-all font-medium",
                                        selected
                                            ? "bg-[#004d40] text-white border-2 border-[#004d40] shadow-md"
                                            : available
                                                ? "bg-white border-2 border-[#004d40]/30 text-[#004d40] font-semibold hover:bg-[#004d40]/5 hover:border-[#004d40]"
                                                : isPast
                                                    ? "bg-gray-200/60 text-gray-400 line-through cursor-not-allowed border border-gray-200"
                                                    : "bg-red-50 text-red-300 cursor-not-allowed border border-red-100"
                                    )}
                                >
                                    {format(slot, 'h:mm a')}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Booking Confirmation Area */}
            {selectedSlot && (
                <div className="fixed bottom-16 left-4 right-4 md:static md:bottom-auto z-40">
                    <Card className="bg-gray-900 text-white shadow-xl animate-in slide-in-from-bottom-4">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase">Booking Summary</p>
                                    <p className="font-bold text-lg">{selectedCourt?.name}</p>
                                </div>
                                <button onClick={() => setSelectedSlot(null)} className="text-gray-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                                <div>
                                    <p className="text-gray-400 text-xs">Time</p>
                                    <p className="font-medium">{format(selectedSlot, 'h:mm a')}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-xs">Duration</p>
                                    <p className="font-medium">{duration} min</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-xs">Players</p>
                                    <p className="font-medium">{numPlayers}</p>
                                </div>
                            </div>
                            {selectedEquipment.length > 0 && (
                                <div className="text-xs text-gray-400 mb-3">
                                    Equipment: {availableEquipment.filter(e => selectedEquipment.includes(e.id)).map(e => e.name).join(', ')}
                                </div>
                            )}
                            <Button
                                onClick={handleBook}
                                disabled={isPending}
                                className="w-full bg-white text-black hover:bg-gray-200 font-bold"
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Booking'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {message && (
                <div className={cn(
                    "p-4 rounded-lg flex items-center",
                    message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                )}>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    {message.text}
                </div>
            )}
        </div>
    )
}
