'use client'

import Link from 'next/link'
import { LayoutDashboard, CheckSquare, ClipboardList, BellRing } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/sign-out-button'

export function ManagerNav() {
    const pathname = usePathname()

    const links = [
        { href: '/manager', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/manager/approvals', label: 'Approvals', icon: CheckSquare },
        { href: '/manager/active', label: 'Active Sessions', icon: ClipboardList },
        { href: '/manager/notifications', label: 'Notifications', icon: BellRing },
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#004d40] text-white shadow-lg md:relative md:bg-transparent md:text-gray-900 md:shadow-none">
            {/* Mobile View */}
            <div className="flex justify-around items-center h-16 md:hidden">
                {links.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                'flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors',
                                isActive ? 'text-yellow-400' : 'text-white/70 hover:text-white'
                            )}
                        >
                            <Icon className="w-6 h-6" />
                            <span className="text-[10px] font-medium">{label}</span>
                        </Link>
                    )
                })}
                <SignOutButton variant="mobile" />
            </div>

            {/* Desktop Sidebar */}
            <div className="hidden md:flex flex-col space-y-4 fixed left-0 top-0 bottom-0 w-64 bg-[#004d40] text-white p-4">
                <div className="h-16 flex items-center px-4 font-bold text-xl">Manager Panel</div>
                {links.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                'flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors',
                                isActive
                                    ? 'bg-white/10 text-yellow-400'
                                    : 'text-white/80 hover:bg-white/5'
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="font-medium">{label}</span>
                        </Link>
                    )
                })}
                <div className="mt-auto">
                    <SignOutButton variant="desktop" />
                </div>
            </div>
        </nav>
    )
}
