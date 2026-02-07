'use client'

import { useState, useTransition, useEffect } from 'react'
import { startOfDay, addDays, format, addMinutes, isSameDay } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createBooking, getBookingsForDateRange } from '@/actions/bookings'
import { Loader2, CheckCircle } from 'lucide-react'

// Types
type Court = { id: string; name: string; sport: string }
type Booking = { id: string; start_time: string; end_time: string; status: string }

export default function BookingUI({ initialCourts }: { initialCourts: Court[] }) {
    const [selectedCourt, setSelectedCourt] = useState<Court | null>(initialCourts[0] || null)
    const [bookings, setBookings] = useState<Booking[]>([])
    const [loadingBookings, setLoadingBookings] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)
    const [isPending, startTransition] = useTransition()
    const [message, setMessage] = useState<string | null>(null)

    // Fetch bookings when court changes
    // ideally use SWR or React Query, but useEffect for simple MVP
    // ignoring refetch for now to save complexity, assuming initial fetch only or manual refresh

    // Simple day generator
    const today = startOfDay(new Date())
    const days = [0, 1, 2, 3].map(offset => addDays(today, offset))

    // Slot generator (6 AM to 10 PM)
    const generateSlots = (date: Date) => {
        const slots = []
        let start = addMinutes(startOfDay(date), 6 * 60) // 06:00
        const end = addMinutes(startOfDay(date), 22 * 60) // 22:00

        while (start < end) {
            slots.push(new Date(start))
            start = addMinutes(start, 30)
        }
        return slots
    }

    const handleCourtChange = async (court: Court) => {
        setSelectedCourt(court)
        setLoadingBookings(true)
        try {
            const data = await getBookingsForDateRange(court.id, today, addDays(today, 4))
            setBookings(data as any)
        } finally {
            setLoadingBookings(false)
        }
    }

    // Initial load
    useEffect(() => {
        if (selectedCourt) {
            // Avoid re-setting the same court to prevent loops if we added dep, 
            // but here we just want to fetch data.
            // Ideally extract fetch logic, but calling handleCourtChange is safe-ish 
            // if we are careful. 
            // Actually, handleCourtChange calls setSelectedCourt, so let's just fetch here to be clean.
            const fetchInitial = async () => {
                setLoadingBookings(true)
                try {
                    const data = await getBookingsForDateRange(selectedCourt.id, today, addDays(today, 4))
                    setBookings(data as any)
                } finally {
                    setLoadingBookings(false)
                }
            }
            fetchInitial()
        }
    }, []) // Run only on mount since we have initialCourt

    // Check if slot is booked
    const isBooked = (slotTime: Date) => {
        return bookings.some(b => {
            const start = new Date(b.start_time)
            const end = new Date(b.end_time)
            return slotTime >= start && slotTime < end
        })
    }

    const handleBook = async () => {
        if (!selectedCourt || !selectedSlot) return

        startTransition(async () => {
            const formData = new FormData()
            formData.append('courtId', selectedCourt.id)
            formData.append('startTime', selectedSlot.toISOString())
            formData.append('duration', '30') // Hardcoded 30 mins for MVP

            const result = await createBooking(null, formData)
            if (result?.error) {
                setMessage(result.error)
            } else {
                setMessage('Booking request sent!')
                // Refresh bookings
                handleCourtChange(selectedCourt)
                setSelectedSlot(null)
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
                        className="whitespace-nowrap"
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
                        onClick={() => setSelectedDate(d)}
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

            {/* Time Slots Grid */}
            <div className="grid grid-cols-3 gap-2">
                {generateSlots(selectedDate).map((slot, i) => {
                    const booked = isBooked(slot)
                    const selected = selectedSlot && slot.getTime() === selectedSlot.getTime()

                    return (
                        <button
                            key={i}
                            disabled={booked}
                            onClick={() => setSelectedSlot(slot)}
                            className={cn(
                                "py-2 text-sm border rounded-md transition-all",
                                booked ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "hover:border-[#004d40]",
                                selected ? "bg-[#004d40] text-white border-[#004d40]" : "bg-white"
                            )}
                        >
                            {format(slot, 'h:mm a')}
                        </button>
                    )
                })}
            </div>

            {/* Booking Confirmation Area */}
            {selectedSlot && (
                <div className="fixed bottom-16 left-4 right-4 md:static md:bottom-auto">
                    <Card className="bg-gray-900 text-white shadow-xl animate-in slide-in-from-bottom-4">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-400">Selected Time</p>
                                <p className="font-bold">{format(selectedSlot, 'MMM d, h:mm a')}</p>
                            </div>
                            <Button onClick={handleBook} disabled={isPending} className="bg-white text-black hover:bg-gray-200">
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {message && (
                <div className="p-4 bg-green-50 text-green-700 rounded-lg flex items-center">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    {message}
                </div>
            )}
        </div>
    )
}
