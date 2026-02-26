'use client'

import { Button } from './ui/button'
import { updateComplaintStatus, markFeedbackAsRead } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { X, Check } from 'lucide-react'

interface FeedbackActionsProps {
    feedbackId: string
    currentStatus: string
}

export function FeedbackActions({ feedbackId, currentStatus }: FeedbackActionsProps) {
    const [loading, setLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const router = useRouter()

    const handleStatusChange = async (newStatus: string) => {
        setLoading(true)
        try {
            await updateComplaintStatus(feedbackId, newStatus)
            router.refresh()
        } catch (error) {
            console.error('Error updating status:', error)
            alert(error instanceof Error ? error.message : 'Failed to update status')
        } finally {
            setLoading(false)
        }
    }

    const handleMarkAsRead = async () => {
        setLoading(true)
        try {
            await markFeedbackAsRead(feedbackId)
            router.refresh()
        } catch (error) {
            console.error('Error deleting feedback:', error)
            alert(error instanceof Error ? error.message : 'Failed to delete')
        } finally {
            setLoading(false)
            setConfirmDelete(false)
        }
    }

    return (
        <div className="flex items-center justify-end gap-2">
            {currentStatus !== 'in_progress' && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange('in_progress')}
                    disabled={loading}
                >
                    In Progress
                </Button>
            )}
            {currentStatus !== 'resolved' && (
                <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleStatusChange('resolved')}
                    disabled={loading}
                >
                    Mark Resolved
                </Button>
            )}

            {/* Two-step delete: first click shows confirm, second actually deletes */}
            {!confirmDelete ? (
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={loading}
                    title="Remove this entry"
                >
                    <X className="w-4 h-4" />
                </Button>
            ) : (
                <div className="flex items-center gap-1">
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleMarkAsRead}
                        disabled={loading}
                        title="Confirm delete"
                    >
                        <Check className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDelete(false)}
                        disabled={loading}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}
