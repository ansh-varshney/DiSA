'use client'

import { useState, useTransition } from 'react'
import {
    markNotificationRead,
    markAllNotificationsRead,
    type AppNotification,
} from '@/actions/notifications'
import { cn } from '@/lib/utils'
import { Bell, CheckCheck, AlertTriangle, CheckCircle, Info, Wrench, Package } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'

function notifIcon(type: string) {
    if (type === 'equipment_incident' || type === 'emergency_alert') {
        return <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
    }
    if (type === 'new_booking') {
        return <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
    }
    if (type === 'maintenance') {
        return <Wrench className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
    }
    if (type.includes('equipment')) {
        return <Package className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
    }
    return <Info className="w-5 h-5 text-[#004d40] shrink-0 mt-0.5" />
}

// Group notifications by date label
function groupByDate(notifications: AppNotification[]) {
    const groups: Record<string, AppNotification[]> = {}
    for (const n of notifications) {
        const d = new Date(n.created_at)
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(today.getDate() - 1)

        let label: string
        if (d.toDateString() === today.toDateString()) label = 'Today'
        else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday'
        else
            label = d.toLocaleDateString('en-IN', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            })

        if (!groups[label]) groups[label] = []
        groups[label].push(n)
    }
    return groups
}

export function AdminNotificationsClient({ notifications }: { notifications: AppNotification[] }) {
    const router = useRouter()
    const [list, setList] = useState(notifications)
    const [isPending, startTransition] = useTransition()

    function markRead(id: string) {
        setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
        startTransition(() => markNotificationRead(id))
    }

    function markAllRead() {
        setList((prev) => prev.map((n) => ({ ...n, is_read: true })))
        startTransition(async () => {
            await markAllNotificationsRead()
            router.refresh()
        })
    }

    const unreadCount = list.filter((n) => !n.is_read).length
    const groups = groupByDate(list)

    if (list.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                <Bell className="w-12 h-12 opacity-30" />
                <p className="text-sm font-medium">No notifications</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {unreadCount > 0 && (
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">{unreadCount} unread</span>
                    <button
                        onClick={markAllRead}
                        disabled={isPending}
                        className="flex items-center gap-1.5 text-sm text-[#004d40] font-medium hover:underline disabled:opacity-50"
                    >
                        <CheckCheck className="w-4 h-4" />
                        Mark all read
                    </button>
                </div>
            )}

            {Object.entries(groups).map(([label, items]) => (
                <section key={label} className="space-y-2">
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {label}
                    </h2>
                    {items.map((n) => (
                        <div
                            key={n.id}
                            onClick={() => !n.is_read && markRead(n.id)}
                            className={cn(
                                'p-4 rounded-xl border bg-white cursor-pointer transition-colors',
                                n.is_read
                                    ? 'border-gray-100 opacity-70'
                                    : 'border-[#004d40]/20 shadow-sm hover:border-[#004d40]/40'
                            )}
                        >
                            <div className="flex items-start gap-3">
                                {notifIcon(n.type)}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <p
                                            className={cn(
                                                'text-sm font-semibold text-gray-900',
                                                n.is_read && 'font-medium text-gray-600'
                                            )}
                                        >
                                            {n.title}
                                        </p>
                                        {!n.is_read && (
                                            <span className="w-2 h-2 rounded-full bg-[#004d40] shrink-0 mt-1.5" />
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-0.5 leading-snug">
                                        {n.body}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1.5">
                                        {formatDistanceToNow(new Date(n.created_at), {
                                            addSuffix: true,
                                        })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </section>
            ))}
        </div>
    )
}
