'use client'

import { LogOut } from 'lucide-react'
import { signOut } from '@/actions/auth'
import { cn } from '@/lib/utils'

interface SignOutButtonProps {
    className?: string
    variant?: 'mobile' | 'desktop'
}

export function SignOutButton({ className, variant = 'desktop' }: SignOutButtonProps) {
    return (
        <button
            onClick={() => signOut()}
            className={cn(
                'flex items-center transition-colors text-white/70 hover:text-white',
                variant === 'desktop'
                    ? 'space-x-3 px-4 py-3 w-full text-left hover:bg-white/5 rounded-lg'
                    : 'flex-col justify-center space-y-1 w-full h-full',
                className
            )}
        >
            <LogOut className={cn(variant === 'desktop' ? 'w-5 h-5' : 'w-6 h-6')} />
            <span className={cn(variant === 'desktop' ? 'font-medium' : 'text-[10px] font-medium')}>
                Logout
            </span>
        </button>
    )
}
