'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface DialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    React.useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange(false)
        }
        if (open) {
            document.addEventListener('keydown', handleEscape)
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.removeEventListener('keydown', handleEscape)
            document.body.style.overflow = 'unset'
        }
    }, [open, onOpenChange])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => onOpenChange(false)}
            />
            {/* Dialog Content */}
            <div className="relative z-50">{children}</div>
        </div>
    )
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
    onClose?: () => void
}

export function DialogContent({ className, children, onClose, ...props }: DialogContentProps) {
    return (
        <div
            className={cn(
                "bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto",
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
}

export function DialogHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("flex items-center justify-between p-6 pb-4", className)} {...props}>
            {children}
        </div>
    )
}

export function DialogTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2 className={cn("text-lg font-semibold text-gray-900", className)} {...props}>
            {children}
        </h2>
    )
}

export function DialogClose({ onClose }: { onClose: () => void }) {
    return (
        <button
            onClick={onClose}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
        </button>
    )
}

export function DialogBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("px-6 py-4", className)} {...props}>
            {children}
        </div>
    )
}

export function DialogFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-lg", className)} {...props}>
            {children}
        </div>
    )
}
