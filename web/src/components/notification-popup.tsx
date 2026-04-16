'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Bell, CheckCircle, AlertTriangle, Info, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    getNewNotifications,
    markNotificationRead,
    type AppNotification,
} from '@/actions/notifications'
import { acceptPlayRequest, rejectPlayRequest } from '@/actions/notifications'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToastEntry {
    notification: AppNotification
    removing: boolean
}

// ─── Icon / colour helpers ────────────────────────────────────────────────────

function toastStyle(type: string) {
    if (
        type.includes('violation') ||
        type.includes('ban') ||
        type.includes('cancelled') ||
        type.includes('rejected') ||
        type.includes('lost')
    ) {
        return {
            border: 'border-red-300 bg-red-50',
            icon: <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />,
        }
    }
    if (type === 'play_request_received') {
        return {
            border: 'border-blue-300 bg-blue-50',
            icon: <UserPlus className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />,
        }
    }
    if (
        type.includes('accepted') ||
        type.includes('completed') ||
        type.includes('cleared') ||
        type.includes('active')
    ) {
        return {
            border: 'border-green-300 bg-green-50',
            icon: <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />,
        }
    }
    return {
        border: 'border-gray-200 bg-white',
        icon: <Info className="w-5 h-5 text-[#004d40] shrink-0 mt-0.5" />,
    }
}

// ─── Single Toast ─────────────────────────────────────────────────────────────

function Toast({ entry, onDismiss }: { entry: ToastEntry; onDismiss: (id: string) => void }) {
    const { notification: n, removing } = entry
    const { border, icon } = toastStyle(n.type)
    const isPlayRequest = n.type === 'play_request_received'
    const playRequestId = n.data?.play_request_id as string | undefined

    const [responding, setResponding] = useState(false)

    async function handleAccept() {
        if (!playRequestId) return
        setResponding(true)
        await acceptPlayRequest(playRequestId)
        onDismiss(n.id)
    }

    async function handleReject() {
        if (!playRequestId) return
        setResponding(true)
        await rejectPlayRequest(playRequestId)
        onDismiss(n.id)
    }

    return (
        <div
            className={cn(
                'w-80 rounded-xl border shadow-lg p-4 transition-all duration-300',
                border,
                removing ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
            )}
        >
            <div className="flex items-start gap-3">
                {icon}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{n.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-snug">{n.body}</p>

                    {isPlayRequest && (
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={handleAccept}
                                disabled={responding}
                                className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-[#004d40] text-white hover:bg-[#003d32] disabled:opacity-50 transition-colors"
                            >
                                Accept
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={responding}
                                className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                            >
                                Decline
                            </button>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => onDismiss(n.id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                    aria-label="Dismiss"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

// ─── Popup Container ──────────────────────────────────────────────────────────

interface NotificationPopupProps {
    /** Notifications already fetched server-side (unread, recent) */
    initial?: AppNotification[]
}

export function NotificationPopup({ initial = [] }: NotificationPopupProps) {
    const [toasts, setToasts] = useState<ToastEntry[]>(() =>
        initial.map((n) => ({ notification: n, removing: false }))
    )
    // Track the latest created_at we've seen so we only fetch newer ones
    const lastSeenRef = useRef<string>(
        initial.length > 0 ? initial[0].created_at : new Date().toISOString()
    )
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

    // Schedule auto-dismiss for non-play-request toasts
    const scheduleAutoDismiss = useCallback((id: string, type: string) => {
        if (type === 'play_request_received') return // stays until user acts
        const t = setTimeout(() => dismiss(id), 8000)
        timersRef.current.set(id, t)
    }, [])

    function dismiss(id: string) {
        // Start fade-out
        setToasts((prev) =>
            prev.map((e) => (e.notification.id === id ? { ...e, removing: true } : e))
        )
        // Remove from DOM after animation
        setTimeout(() => {
            setToasts((prev) => prev.filter((e) => e.notification.id !== id))
            timersRef.current.delete(id)
        }, 300)
        // Mark read in background
        markNotificationRead(id).catch(() => {})
    }

    // Wire auto-dismiss for initial toasts
    useEffect(() => {
        for (const { notification: n } of toasts) {
            if (!timersRef.current.has(n.id)) {
                scheduleAutoDismiss(n.id, n.type)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Polling every 20 seconds
    useEffect(() => {
        const interval = setInterval(async () => {
            const fresh = await getNewNotifications(lastSeenRef.current)
            if (fresh.length === 0) return

            // Update watermark
            lastSeenRef.current = fresh[0].created_at

            setToasts((prev) => {
                const existingIds = new Set(prev.map((e) => e.notification.id))
                const newEntries = fresh
                    .filter((n) => !existingIds.has(n.id))
                    .map((n) => ({ notification: n, removing: false }))
                return [...newEntries, ...prev]
            })

            // Schedule auto-dismiss for new toasts
            for (const n of fresh) {
                scheduleAutoDismiss(n.id, n.type)
            }
        }, 20_000)

        return () => clearInterval(interval)
    }, [scheduleAutoDismiss])

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            for (const t of timersRef.current.values()) clearTimeout(t)
        }
    }, [])

    if (toasts.length === 0) return null

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
            {toasts.slice(0, 5).map((entry) => (
                <div key={entry.notification.id} className="pointer-events-auto">
                    <Toast entry={entry} onDismiss={dismiss} />
                </div>
            ))}
            {toasts.length > 5 && (
                <div className="pointer-events-auto">
                    <div className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-full shadow">
                        +{toasts.length - 5} more
                    </div>
                </div>
            )}
        </div>
    )
}
