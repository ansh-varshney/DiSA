'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { cancelReservation, priorityReserveSlot, reserveForMaintenance } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Crown, Wrench } from 'lucide-react'

interface Reservation {
    id: string
    is_priority: boolean
    is_maintenance?: boolean
    profiles?: {
        full_name: string
        student_id: string
    }
}

interface ReservationSlotDialogProps {
    open: boolean
    onClose: () => void
    courtName: string
    time: string
    date: string
    courtId: string
    reservation?: Reservation
    sport: string
}

export function ReservationSlotDialog({
    open,
    onClose,
    courtName,
    time,
    date,
    courtId,
    reservation,
    sport
}: ReservationSlotDialogProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const formatTime = (timeStr: string) => {
        const [hour, minute] = timeStr.split(':').map(Number)
        const period = hour >= 12 ? 'PM' : 'AM'
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
        return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`
    }

    const handleCancel = async () => {
        if (!reservation) return

        setLoading(true)
        try {
            await cancelReservation(reservation.id)
            onClose()
            router.refresh()
        } catch (error) {
            console.error('Error cancelling reservation:', error)
            alert(error instanceof Error ? error.message : 'Failed to cancel reservation')
        } finally {
            setLoading(false)
        }
    }

    const handlePriorityReserve = async () => {
        setLoading(true)
        try {
            // Calculate end time (30 minutes after start)
            const [hour, minute] = time.split(':').map(Number)
            const endHour = minute === 30 ? hour + 1 : hour
            const endMinute = minute === 30 ? 0 : 30
            const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`

            await priorityReserveSlot(courtId, date, time, endTime)
            onClose()
            router.refresh()
        } catch (error) {
            console.error('Error creating priority reservation:', error)
            alert(error instanceof Error ? error.message : 'Failed to create priority reservation')
        } finally {
            setLoading(false)
        }
    }

    const handleMaintenanceReserve = async () => {
        setLoading(true)
        try {
            // Calculate end time (30 minutes after start)
            const [hour, minute] = time.split(':').map(Number)
            const endHour = minute === 30 ? hour + 1 : hour
            const endMinute = minute === 30 ? 0 : 30
            const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`

            await reserveForMaintenance(courtId, date, time, endTime)
            onClose()
            router.refresh()
        } catch (error) {
            console.error('Error creating maintenance reservation:', error)
            alert(error instanceof Error ? error.message : 'Failed to create maintenance reservation')
        } finally {
            setLoading(false)
        }
    }

    const isReserved = !!reservation

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {isReserved ? 'Reservation Details' : 'Reserve Slot'}
                    </DialogTitle>
                    <DialogClose onClose={onClose} />
                </DialogHeader>

                <DialogBody>
                    <div className="space-y-4">
                        {/* Slot Info */}
                        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                            <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600">Court:</span>
                                <span className="text-sm font-semibold text-gray-900">{courtName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600">Sport:</span>
                                <span className="text-sm font-semibold text-gray-900 capitalize">{sport}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600">Date:</span>
                                <span className="text-sm font-semibold text-gray-900">
                                    {new Date(date).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                    })}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600">Time:</span>
                                <span className="text-sm font-semibold text-gray-900">{formatTime(time)}</span>
                            </div>
                        </div>

                        {isReserved ? (
                            /* Reserved Slot Info */
                            <>
                                {reservation.is_maintenance ? (
                                    <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg flex items-start gap-3">
                                        <Wrench className="w-5 h-5 text-orange-600 mt-0.5" />
                                        <div>
                                            <h4 className="font-semibold text-orange-900 mb-1">Maintenance Reservation</h4>
                                            <p className="text-sm text-orange-700">
                                                This slot has been reserved for court maintenance.
                                            </p>
                                        </div>
                                    </div>
                                ) : reservation.is_priority ? (
                                    <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg flex items-start gap-3">
                                        <Crown className="w-5 h-5 text-purple-600 mt-0.5" />
                                        <div>
                                            <h4 className="font-semibold text-purple-900 mb-1">Admin Priority Reservation</h4>
                                            <p className="text-sm text-purple-700">
                                                This slot has been reserved by an administrator with priority status.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg space-y-2">
                                        <h4 className="font-semibold text-blue-900 mb-2">Student Reservation</h4>
                                        <div className="flex justify-between">
                                            <span className="text-sm font-medium text-blue-700">Name:</span>
                                            <span className="text-sm font-semibold text-blue-900">
                                                {reservation.profiles?.full_name}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm font-medium text-blue-700">Student ID:</span>
                                            <span className="text-sm font-semibold text-blue-900">
                                                {reservation.profiles?.student_id}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                                    <p className="text-xs text-yellow-800">
                                        Cancelling this reservation will notify the student and manager.
                                    </p>
                                </div>
                            </>
                        ) : (
                            /* Available Slot Info */
                            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                                <h4 className="font-semibold text-green-900 mb-2">Available Slot</h4>
                                <p className="text-sm text-green-700">
                                    This time slot is currently available. You can reserve it with priority status as an administrator.
                                </p>
                            </div>
                        )}
                    </div>
                </DialogBody>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={loading}
                    >
                        Close
                    </Button>

                    {isReserved ? (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleCancel}
                            disabled={loading}
                        >
                            {loading ? 'Cancelling...' : 'Cancel Reservation'}
                        </Button>
                    ) : (
                        <>
                            <Button
                                type="button"
                                onClick={handlePriorityReserve}
                                disabled={loading}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                {loading ? 'Reserving...' : 'Priority Reserve'}
                            </Button>
                            <Button
                                type="button"
                                onClick={handleMaintenanceReserve}
                                disabled={loading}
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                {loading ? 'Reserving...' : 'Reserve for Maintenance'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
