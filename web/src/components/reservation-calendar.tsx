'use client'

import React, { useState } from 'react'
import { Card, CardContent } from './ui/card'
import { ReservationSlotDialog } from './reservation-slot-dialog'

interface Court {
    id: string
    name: string
    court_id: string
}

interface Equipment {
    id: string
    name: string
    equipment_id: string
    sport: string
    condition: string
}

interface Reservation {
    id: string
    court_id: string
    start_time: string
    end_time: string
    user_id: string
    is_priority: boolean
    is_maintenance?: boolean
    num_players?: number
    equipment_ids?: string[] | null
    profiles?: {
        full_name: string
        student_id: string
    }
}

interface ReservationCalendarProps {
    courts: Court[]
    reservations: Reservation[]
    selectedDate: string
    sport: string
    equipment: Equipment[]
}

// Generate 30-minute time slots for full 24-hour day (12 AM to 11:30 PM)
const generateTimeSlots = () => {
    const slots: string[] = []
    for (let hour = 0; hour <= 23; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
            const hourStr = hour.toString().padStart(2, '0')
            const minuteStr = minute.toString().padStart(2, '0')
            slots.push(`${hourStr}:${minuteStr}`)
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

export function ReservationCalendar({ courts, reservations, selectedDate, sport, equipment }: ReservationCalendarProps) {
    const [selectedSlot, setSelectedSlot] = useState<{
        courtId: string
        courtName: string
        time: string
        reservation?: Reservation
    } | null>(null)

    const timeSlots = generateTimeSlots()

    // Check if a time slot is in the past (only matters for today)
    const isToday = (() => {
        const now = new Date()
        const selected = new Date(selectedDate)
        return now.getFullYear() === selected.getFullYear() &&
            now.getMonth() === selected.getMonth() &&
            now.getDate() === selected.getDate()
    })()

    const isSlotInPast = (slotTime: string): boolean => {
        if (!isToday) return false
        const now = new Date()
        const [hour, minute] = slotTime.split(':').map(Number)
        const slotDate = new Date()
        slotDate.setHours(hour, minute, 0, 0)
        return slotDate <= now
    }

    // Find reservation for specific court and time slot
    const getReservationForSlot = (courtId: string, slotTime: string): Reservation | undefined => {
        return reservations.find(res => {
            const resStartTime = new Date(res.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
            return res.court_id === courtId && resStartTime === slotTime
        })
    }

    const handleSlotClick = (court: Court, time: string, reservation?: Reservation) => {
        if (isSlotInPast(time)) return
        setSelectedSlot({
            courtId: court.id,
            courtName: court.name,
            time,
            reservation
        })
    }

    if (courts.length === 0) {
        return (
            <Card>
                <CardContent className="p-12">
                    <div className="text-center text-gray-500">
                        <p>No courts available for {sport}.</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <div className="inline-block min-w-full">
                            {/* Calendar Grid */}
                            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${courts.length}, minmax(120px, 1fr))` }}>
                                {/* Header Row */}
                                <div className="sticky top-0 left-0 z-20 bg-gray-50 border-b border-r border-gray-200 p-3">
                                    <span className="text-xs font-semibold text-gray-600">TIME</span>
                                </div>
                                {courts.map(court => (
                                    <div key={court.id} className="sticky top-0 z-10 bg-gray-50 border-b border-r border-gray-200 p-3">
                                        <div className="font-semibold text-sm text-gray-900">{court.court_id}</div>
                                        <div className="text-xs text-gray-600">{court.name}</div>
                                    </div>
                                ))}

                                {/* Time Slots */}
                                {timeSlots.map((time, timeIndex) => (
                                    <React.Fragment key={time}>
                                        {/* Time Label */}
                                        <div
                                            className="sticky left-0 z-10 bg-white border-r border-b border-gray-200 p-2 text-xs text-gray-600 font-medium"
                                        >
                                            {formatTime(time)}
                                        </div>

                                        {/* Court Slots */}
                                        {courts.map(court => {
                                            const reservation = getReservationForSlot(court.id, time)
                                            const isReserved = !!reservation
                                            const isPriority = reservation?.is_priority
                                            const isMaintenance = reservation?.is_maintenance
                                            const isPast = isSlotInPast(time)

                                            return (
                                                <div
                                                    key={`${court.id}-${time}`}
                                                    onClick={() => handleSlotClick(court, time, reservation)}
                                                    className={`
                                                        border-r border-b border-gray-200 p-2 min-h-[50px] transition-colors
                                                        ${isPast
                                                            ? 'bg-gray-100 cursor-not-allowed opacity-60'
                                                            : isReserved
                                                                ? isMaintenance
                                                                    ? 'bg-orange-50 hover:bg-orange-100 border-l-4 border-l-orange-500 cursor-pointer'
                                                                    : isPriority
                                                                        ? 'bg-purple-50 hover:bg-purple-100 border-l-4 border-l-purple-500 cursor-pointer'
                                                                        : 'bg-blue-50 hover:bg-blue-100 border-l-4 border-l-blue-500 cursor-pointer'
                                                                : 'bg-white hover:bg-gray-50 cursor-pointer'
                                                        }
                                                    `}
                                                >
                                                    {isPast && !isReserved ? (
                                                        <div className="text-[10px] text-gray-400 italic">Passed</div>
                                                    ) : reservation ? (
                                                        <div className="text-xs">
                                                            {isMaintenance ? (
                                                                <div className="font-semibold text-orange-700">🔧 Maintenance</div>
                                                            ) : isPriority ? (
                                                                <div className="font-semibold text-purple-700">Admin Priority</div>
                                                            ) : (
                                                                <>
                                                                    <div className="font-semibold text-blue-700">
                                                                        {reservation.profiles?.full_name}
                                                                    </div>
                                                                    <div className="text-gray-500 text-[10px]">
                                                                        {reservation.profiles?.student_id}
                                                                    </div>
                                                                </>
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

            {/* Slot Action Dialog */}
            {/* Slot Action Dialog */}
            {selectedSlot && (
                <ReservationSlotDialog
                    open={!!selectedSlot}
                    onClose={() => setSelectedSlot(null)}
                    courtName={selectedSlot.courtName}
                    time={selectedSlot.time}
                    date={selectedDate}
                    courtId={selectedSlot.courtId}
                    reservation={selectedSlot.reservation ? {
                        ...selectedSlot.reservation,
                        equipment_ids: selectedSlot.reservation.equipment_ids || []
                    } : undefined}
                    sport={sport}
                    equipment={equipment}
                    unavailableEquipmentIds={(() => {
                        // Find all reservations that overlap with this time slot across ALL courts
                        // Simple 30 min slot logic: start times match
                        const concurrentReservations = reservations.filter(res => {
                            const resStartTime = new Date(res.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
                            return resStartTime === selectedSlot.time
                        })

                        // Collect all equipment IDs from these reservations (excluding current reservation if editing)
                        const ids = new Set<string>()
                        concurrentReservations.forEach(res => {
                            // If we were editing, we'd exclude current res. But here we just want to know what's TAKEN.
                            // If I am viewing my own reservation, my equipment is "taken" by me, which is fine.
                            // But for a NEW reservation (selectedSlot.reservation is undefined), we need to know what's taken by others.
                            if (res.equipment_ids) {
                                res.equipment_ids.forEach(id => ids.add(id))
                            }
                        })
                        return Array.from(ids)
                    })()}
                />
            )}
        </>
    )
}
