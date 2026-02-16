'use client'

import { Button } from './ui/button'
import { updateComplaintStatus } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
        </div>
    )
}
