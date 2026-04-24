'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Construction, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MaintenanceEntry {
    id: string
    name: string
    sport: string
    maintenance_notes: string | null
    is_active: boolean | null
    is_booking_slot?: boolean
    start_time?: Date | string
    end_time?: Date | string
}

interface MaintenanceFlashcardProps {
    courts: MaintenanceEntry[]
}

export function MaintenanceFlashcard({ courts }: MaintenanceFlashcardProps) {
    const [isOpen, setIsOpen] = useState(false)

    if (!courts || courts.length === 0) return null

    const disabledCourts = courts.filter((c) => !c.is_booking_slot)
    const maintenanceSlots = courts.filter((c) => c.is_booking_slot)

    return (
        <div className="relative">
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold shadow-md transition-all active:scale-95',
                    'bg-orange-100 text-orange-800 border-2 border-orange-200 hover:bg-orange-200'
                )}
            >
                <Construction className="w-4 h-4" />
                <span>Maintenance ({courts.length})</span>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {/* Expandable Content */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 z-50 w-80 md:w-96 animate-in fade-in slide-in-from-top-2">
                    <Card className="border-l-4 border-l-orange-500 shadow-xl">
                        <CardHeader className="p-4 py-3 bg-orange-50/50 border-b border-orange-100">
                            <CardTitle className="text-sm font-bold text-orange-900 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-orange-600" />
                                Today&apos;s Maintenance Schedule
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 max-h-80 overflow-y-auto divide-y divide-gray-100">
                            {/* Scheduled Booking Slots */}
                            {maintenanceSlots.length > 0 && (
                                <div>
                                    <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                        Blocked Slots Today
                                    </div>
                                    {maintenanceSlots.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className="p-3 hover:bg-orange-50 transition-colors"
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-semibold text-sm text-gray-800">
                                                    {entry.name}
                                                </span>
                                                <span className="text-[10px] uppercase font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                                                    {entry.sport}
                                                </span>
                                            </div>
                                            {entry.start_time && entry.end_time && (
                                                <p className="text-xs text-gray-600 flex items-center gap-1.5">
                                                    <Clock className="w-3 h-3 text-orange-500 shrink-0" />
                                                    {format(new Date(entry.start_time), 'h:mm a')} –{' '}
                                                    {format(new Date(entry.end_time), 'h:mm a')}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Permanently Disabled Courts */}
                            {disabledCourts.length > 0 && (
                                <div>
                                    <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                        Out of Service
                                    </div>
                                    {disabledCourts.map((court) => (
                                        <div
                                            key={court.id}
                                            className="p-3 hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-semibold text-sm text-gray-800">
                                                    {court.name}
                                                </span>
                                                <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    {court.sport}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 leading-snug">
                                                {court.maintenance_notes ||
                                                    'Temporarily out of service.'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
