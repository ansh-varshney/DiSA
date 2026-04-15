'use client'

import { useState, useTransition } from 'react'
import { markNotificationRead, markAllNotificationsRead, type AppNotification } from '@/actions/notifications'
import { cn } from '@/lib/utils'
import { CheckCheck, Bell, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'

function notifIcon(type: string) {
    if (type.includes('violation') || type.includes('ban') || type.includes('cancelled') || type.includes('lost')) {
        return <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
    }
    if (type.includes('accepted') || type.includes('completed') || type.includes('cleared') || type.includes('active')) {
        return <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
    }
    return <Info className="w-5 h-5 text-[#004d40] shrink-0 mt-0.5" />
}

export function NotificationsClient({ notifications }: { notifications: AppNotification[] }) {
    const router = useRouter()
    const [list, setList] = useState(notifications)
    const [isPending, startTransition] = useTransition()

    function markRead(id: string) {
        setList((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
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

    if (list.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                <Bell className="w-12 h-12 opacity-30" />
                <p className="text-sm font-medium">No notifications yet</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
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

            <div className="space-y-2">
                {list.map((n) => (
                    <div
                        key={n.id}
                        onClick={() => !n.is_read && markRead(n.id)}
                        className={cn(
                            'p-4 rounded-xl border cursor-pointer transition-colors',
                            n.is_read
                                ? 'bg-white border-gray-100 opacity-70'
                                : 'bg-white border-[#004d40]/20 shadow-sm hover:border-[#004d40]/40',
                        )}
                    >
                        <div className="flex items-start gap-3">
                            {notifIcon(n.type)}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <p className={cn('text-sm font-semibold text-gray-900', n.is_read && 'font-medium text-gray-600')}>
                                        {n.title}
                                    </p>
                                    {!n.is_read && (
                                        <span className="w-2 h-2 rounded-full bg-[#004d40] shrink-0 mt-1.5" />
                                    )}
                                </div>
                                <p className="text-sm text-gray-600 mt-0.5 leading-snug">{n.body}</p>
                                <p className="text-xs text-gray-400 mt-1.5">
                                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
