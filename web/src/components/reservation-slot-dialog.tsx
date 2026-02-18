'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { cancelReservation, priorityReserveSlot, reserveForMaintenance } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Crown, Wrench, Minus, Plus, ChevronDown, Check, ArrowLeft, Users, Dumbbell } from 'lucide-react'

interface Equipment {
    id: string
    name: string
    equipment_id: string
    sport: string
    condition: string
}

interface Reservation {
    id: string
    is_priority: boolean
    is_maintenance?: boolean
    num_players?: number
    equipment_ids?: string[] | null
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
    equipment: Equipment[]
    unavailableEquipmentIds?: string[]
}

type BookingStep = 'info' | 'details'
type BookingType = 'priority' | 'maintenance'

export function ReservationSlotDialog({
    open,
    onClose,
    courtName,
    time,
    date,
    courtId,
    reservation,
    sport,
    equipment,
    unavailableEquipmentIds = []
}: ReservationSlotDialogProps) {
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState<BookingStep>('info')
    const [bookingType, setBookingType] = useState<BookingType>('priority')
    const [numPlayers, setNumPlayers] = useState(2)
    const [selectedEquipment, setSelectedEquipment] = useState<string[]>([])
    const [equipmentDropdownOpen, setEquipmentDropdownOpen] = useState(false)
    const router = useRouter()

    // Reset form state when dialog opens
    useEffect(() => {
        if (open) {
            setStep('info')
            setNumPlayers(2)
            setSelectedEquipment([])
            setEquipmentDropdownOpen(false)
        }
    }, [open])

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

    const handleMaintenanceReserve = async () => {
        setLoading(true)
        try {
            const [hour, minute] = time.split(':').map(Number)
            const endHour = minute === 30 ? hour + 1 : hour
            const endMinute = minute === 30 ? 0 : 30
            const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`

            // Maintenance reservation: 0 players, no equipment
            await reserveForMaintenance(courtId, date, time, endTime, 0, [])
            onClose()
            router.refresh()
        } catch (error) {
            console.error('Error creating maintenance reservation:', error)
            alert(error instanceof Error ? error.message : 'Failed to create reservation')
        } finally {
            setLoading(false)
        }
    }

    const handleConfirmReservation = async () => {
        setLoading(true)
        try {
            const [hour, minute] = time.split(':').map(Number)
            const endHour = minute === 30 ? hour + 1 : hour
            const endMinute = minute === 30 ? 0 : 30
            const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`

            // Only priority booking uses this flow now
            await priorityReserveSlot(courtId, date, time, endTime, numPlayers, selectedEquipment)
            onClose()
            router.refresh()
        } catch (error) {
            console.error('Error creating reservation:', error)
            alert(error instanceof Error ? error.message : 'Failed to create reservation')
        } finally {
            setLoading(false)
        }
    }

    const toggleEquipment = (equipId: string) => {
        setSelectedEquipment(prev =>
            prev.includes(equipId)
                ? prev.filter(id => id !== equipId)
                : [...prev, equipId]
        )
    }

    const isReserved = !!reservation

    // Get equipment details for existing reservation
    const reservedEquipment = reservation?.equipment_ids?.map(id =>
        equipment.find(e => e.id === id)
    ).filter(Boolean) || []

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {isReserved
                            ? 'Reservation Details'
                            : step === 'details'
                                ? 'Priority Reservation'
                                : 'Reserve Slot'}
                    </DialogTitle>
                    <DialogClose onClose={onClose} />
                </DialogHeader>

                <DialogBody>
                    <div className="space-y-4">
                        {/* Slot Info - always shown */}
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

                                {/* Additional Details: Players & Equipment */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Users className="w-4 h-4 text-gray-500" />
                                            <span className="text-xs font-medium text-gray-500">Players</span>
                                        </div>
                                        <span className="text-sm font-semibold text-gray-900">
                                            {reservation.num_players || 2}
                                        </span>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Dumbbell className="w-4 h-4 text-gray-500" />
                                            <span className="text-xs font-medium text-gray-500">Equipment</span>
                                        </div>
                                        {reservedEquipment.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {reservedEquipment.map((item: any) => (
                                                    <span key={item.id} className="text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-700">
                                                        {item.name}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-sm text-gray-400 italic">None</span>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                                    <p className="text-xs text-yellow-800">
                                        Cancelling this reservation will notify the student and manager.
                                    </p>
                                </div>
                            </>
                        ) : step === 'info' ? (
                            /* Step 1: Available slot - choose booking type */
                            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                                <h4 className="font-semibold text-green-900 mb-2">Available Slot</h4>
                                <p className="text-sm text-green-700">
                                    This time slot is currently available. Choose a reservation type below.
                                </p>
                            </div>
                        ) : (
                            /* Step 2: Player count & Equipment selection */
                            <>
                                {/* Number of Players */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Number of Players</label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setNumPlayers(Math.max(2, numPlayers - 1))}
                                            disabled={numPlayers <= 2}
                                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <Minus className="w-4 h-4 text-gray-700" />
                                        </button>
                                        <span className="text-lg font-bold text-gray-900 w-8 text-center">{numPlayers}</span>
                                        <button
                                            type="button"
                                            onClick={() => setNumPlayers(numPlayers + 1)}
                                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                                        >
                                            <Plus className="w-4 h-4 text-gray-700" />
                                        </button>
                                        <span className="text-xs text-gray-500 ml-1">(min. 2)</span>
                                    </div>
                                </div>

                                {/* Equipment Selection */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Equipment (optional)</label>
                                    {equipment.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">No equipment available for {sport}</p>
                                    ) : (
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setEquipmentDropdownOpen(!equipmentDropdownOpen)}
                                                className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm transition-colors"
                                            >
                                                <span className={selectedEquipment.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
                                                    {selectedEquipment.length > 0
                                                        ? `${selectedEquipment.length} item${selectedEquipment.length > 1 ? 's' : ''} selected`
                                                        : 'Select equipment...'}
                                                </span>
                                                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${equipmentDropdownOpen ? 'rotate-180' : ''}`} />
                                            </button>

                                            {equipmentDropdownOpen && (
                                                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                                    {equipment.map(item => {
                                                        const isUnavailable = unavailableEquipmentIds.includes(item.id)
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                type="button"
                                                                onClick={() => !isUnavailable && toggleEquipment(item.id)}
                                                                disabled={isUnavailable}
                                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${isUnavailable
                                                                    ? 'opacity-50 cursor-not-allowed bg-gray-50'
                                                                    : 'hover:bg-gray-50 cursor-pointer'
                                                                    }`}
                                                            >
                                                                <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${selectedEquipment.includes(item.id)
                                                                    ? 'bg-[#004d40] border-[#004d40]'
                                                                    : 'border-gray-300'
                                                                    }`}>
                                                                    {selectedEquipment.includes(item.id) && (
                                                                        <Check className="w-3 h-3 text-white" />
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="text-gray-900 font-medium">{item.name}</span>
                                                                    <span className="text-gray-500 ml-1 text-xs">
                                                                        ({item.equipment_id})
                                                                        {isUnavailable && ' - Booked'}
                                                                    </span>
                                                                </div>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}

                                            {/* Selected equipment tags */}
                                            {selectedEquipment.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {selectedEquipment.map(eqId => {
                                                        const item = equipment.find(e => e.id === eqId)
                                                        return item ? (
                                                            <span
                                                                key={eqId}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#004d40]/10 text-[#004d40] text-xs rounded-full font-medium"
                                                            >
                                                                {item.name}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleEquipment(eqId)}
                                                                    className="hover:text-red-600 transition-colors"
                                                                >
                                                                    ×
                                                                </button>
                                                            </span>
                                                        ) : null
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </DialogBody>

                <DialogFooter>
                    {isReserved ? (
                        /* Reserved: Close + Cancel */
                        <>
                            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                                Close
                            </Button>
                            <Button type="button" variant="destructive" onClick={handleCancel} disabled={loading}>
                                {loading ? 'Cancelling...' : 'Cancel Reservation'}
                            </Button>
                        </>
                    ) : step === 'info' ? (
                        /* Step 1: Close + Priority Reserve + Maintenance */
                        <>
                            <Button type="button" variant="outline" onClick={onClose}>
                                Close
                            </Button>
                            <Button
                                type="button"
                                onClick={() => { setBookingType('priority'); setStep('details') }}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                Priority Reserve
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
                    ) : (
                        /* Step 2: Back + Confirm (Priority Only) */
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setStep('info')}
                                disabled={loading}
                            >
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                Back
                            </Button>
                            <Button
                                type="button"
                                onClick={handleConfirmReservation}
                                disabled={loading}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                {loading ? 'Reserving...' : 'Confirm Reservation'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
