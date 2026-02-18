'use client'

import { Button } from './ui/button'
import { updateComplaintStatus, markFeedbackAsRead } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { X } from 'lucide-react'

interface FeedbackActionsProps {
    feedbackId: string
    currentStatus: string
}

export function FeedbackActions({ feedbackId, currentStatus }: FeedbackActionsProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleStatusChange = async (newStatus: string) => {
        if (confirm(`Change status to "${newStatus.replace('_', ' ')}"?`)) {
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
    }

    const handleMarkAsRead = async () => {
        if (confirm('Mark this feedback as read? This will permanently remove it.')) {
            setLoading(true)
            try {
                await markFeedbackAsRead(feedbackId)
                router.refresh()
            } catch (error) {
                console.error('Error marking as read:', error)
                alert(error instanceof Error ? error.message : 'Failed to mark as read')
            } finally {
                setLoading(false)
            }
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
            <Button
                variant="destructive"
                size="sm"
                onClick={handleMarkAsRead}
                disabled={loading}
                title="Mark as Read (Remove)"
            >
                <X className="w-4 h-4" />
            </Button>
        </div>
    )
}
