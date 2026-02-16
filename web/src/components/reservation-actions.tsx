'use client'

import { Button } from './ui/button'
import { forceCancelBooking } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface ReservationActionsProps {
    bookingId: string
    currentStatus: string
}

export function ReservationActions({ bookingId, currentStatus }: ReservationActionsProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleForceCancel = async () => {
        if (confirm('Are you sure you want to force cancel this reservation? The student will be notified.')) {
            setLoading(true)
            try {
                await forceCancelBooking(bookingId)
                router.refresh()
            } catch (error) {
                console.error('Error cancelling booking:', error)
                alert(error instanceof Error ? error.message : 'Failed to cancel booking')
            } finally {
                setLoading(false)
            }
        }
    }

    if (currentStatus === 'cancelled' || currentStatus === 'completed') {
        return <span className="text-xs text-gray-400">No actions available</span>
    }

    return (
        <Button
            variant="destructive"
            size="sm"
            onClick={handleForceCancel}
            disabled={loading}
        >
            {loading ? 'Cancelling...' : 'Force Cancel'}
        </Button>
    )
}
