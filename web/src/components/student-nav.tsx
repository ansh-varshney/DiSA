'use client'

import Link from 'next/link'
import { Home, CalendarPlus, History, User, Trophy } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/sign-out-button'

export function StudentNav() {
    const pathname = usePathname()

    const links = [
        { href: '/student', label: 'Home', icon: Home },
        { href: '/student/book', label: 'Book', icon: CalendarPlus },
        { href: '/student/reservations', label: 'Reservations', icon: History },
        { href: '/student/leaderboard', label: 'Leaderboard', icon: Trophy },
        { href: '/student/profile', label: 'Profile', icon: User },
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg md:relative md:border-t-0 md:bg-transparent md:shadow-none">
            <div className="flex justify-around items-center h-16 md:hidden">
                {links.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-full space-y-1",
                                isActive ? "text-[#004d40]" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            <Icon className={cn("w-6 h-6", isActive && "fill-current")} />
                            <span className="text-[10px] font-medium">{label}</span>
                        </Link>
                    )
                })}
                <SignOutButton variant="mobile" className="text-gray-500 hover:text-gray-900" />
            </div>
            {/* Desktop View Placeholder - We focus on Mobile First */}
            <div className="hidden md:flex flex-col space-y-4 fixed left-0 top-0 bottom-0 w-64 bg-white border-r p-4">
                <div className="h-16 flex items-center px-4 font-bold text-xl text-[#004d40]">
                    SportPortal
                </div>
                {links.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
                                isActive ? "bg-[#004d40]/10 text-[#004d40]" : "text-gray-600 hover:bg-gray-50"
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="font-medium">{label}</span>
                        </Link>
                    )
                })}
                <div className="mt-auto">
                    <SignOutButton variant="desktop" className="text-gray-600 hover:bg-gray-50" />
                </div>
            </div>
        </nav>
    )
}
