'use client'

import Link from 'next/link'
import {
    LayoutDashboard,
    Package,
    MapPin,
    Calendar,
    AlertTriangle,
    Bell,
    MessageSquare,
    Users,
    ScrollText,
    BellRing,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/sign-out-button'

export function AdminNav() {
    const pathname = usePathname()

    const links = [
        { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/admin/equipment', label: 'Equipment', icon: Package },
        { href: '/admin/courts', label: 'Courts', icon: MapPin },
        { href: '/admin/reservations', label: 'Reservations', icon: Calendar },
        { href: '/admin/defaulters', label: 'Defaulters', icon: AlertTriangle },
        { href: '/admin/announcements', label: 'Announcements', icon: Bell },
        { href: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
        { href: '/admin/coordinators', label: 'Sport Info', icon: Users },
        { href: '/admin/logs', label: 'Logs', icon: ScrollText },
        { href: '/admin/notifications', label: 'Notifications', icon: BellRing },
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg md:relative md:border-t-0 md:bg-transparent md:shadow-none">
            {/* Mobile View */}
            <div className="flex overflow-x-auto items-center h-16 md:hidden">
                {links.slice(0, 5).map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                'flex flex-col items-center justify-center min-w-[20%] h-full space-y-1 transition-colors',
                                isActive ? 'text-[#004d40]' : 'text-gray-500 hover:text-gray-900'
                            )}
                        >
                            <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5px]')} />
                            <span className="text-[9px] font-medium">{label}</span>
                        </Link>
                    )
                })}
                <div className="min-w-[20%] flex justify-center">
                    <SignOutButton variant="mobile" className="text-gray-500 hover:text-gray-900" />
                </div>
            </div>

            {/* Desktop Sidebar */}
            <div className="hidden md:flex flex-col space-y-2 fixed left-0 top-0 bottom-0 w-64 bg-white border-r p-4 overflow-y-auto">
                <div className="h-16 flex items-center px-4 font-bold text-xl text-[#004d40] mb-2">
                    Admin Panel
                </div>
                {links.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                'flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors',
                                isActive
                                    ? 'bg-[#004d40] text-white'
                                    : 'text-gray-600 hover:bg-gray-100'
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="font-medium">{label}</span>
                        </Link>
                    )
                })}
                <div className="mt-auto pt-4">
                    <SignOutButton variant="desktop" className="text-gray-600 hover:bg-gray-100" />
                </div>
            </div>
        </nav>
    )
}
