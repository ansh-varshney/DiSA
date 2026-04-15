'use client'

import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from './ui/dialog'
import { forceCancelBooking } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface ReservationActionsProps {
    bookingId: string
    currentStatus: string
}

export function ReservationActions({ bookingId, currentStatus }: ReservationActionsProps) {
    const [loading, setLoading] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const router = useRouter()

    const handleForceCancel = async () => {
        setLoading(true)
        try {
            await forceCancelBooking(bookingId)
            setDialogOpen(false)
            router.refresh()
        } catch (error) {
            console.error('Error cancelling booking:', error)
            alert(error instanceof Error ? error.message : 'Failed to cancel booking')
        } finally {
            setLoading(false)
        }
    }

    if (currentStatus === 'cancelled' || currentStatus === 'completed') {
        return <span className="text-xs text-gray-400">No actions available</span>
    }

    return (
        <>
            <Button
                variant="destructive"
                size="sm"
                onClick={() => setDialogOpen(true)}
            >
                Force Cancel
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Force Cancel Reservation</DialogTitle>
                        <DialogClose onClose={() => setDialogOpen(false)} />
                    </DialogHeader>
                    <DialogBody>
                        <p className="text-sm text-gray-600">
                            Are you sure you want to force cancel this reservation? The booker and all
                            confirmed players will be notified.
                        </p>
                    </DialogBody>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDialogOpen(false)}
                            disabled={loading}
                        >
                            Keep Reservation
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleForceCancel}
                            disabled={loading}
                        >
                            {loading ? 'Cancelling...' : 'Yes, Force Cancel'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
