'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Construction } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MaintenanceFlashcardProps {
    courts: {
        id: string
        name: string
        sport: string
        maintenance_notes: string | null
        is_active: boolean
    }[]
}

export function MaintenanceFlashcard({ courts }: MaintenanceFlashcardProps) {
    const [isOpen, setIsOpen] = useState(false)

    if (!courts || courts.length === 0) return null

    return (
        <div className="relative">
            {/* Toggle Button / Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold shadow-md transition-all active:scale-95",
                    "bg-orange-100 text-orange-800 border-2 border-orange-200 hover:bg-orange-200"
                )}
            >
                <Construction className="w-4 h-4" />
                <span>Maintenance ({courts.length})</span>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {/* Expandable Content */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 z-50 w-72 md:w-80 animate-in fade-in slide-in-from-top-2">
                    <Card className="border-l-4 border-l-orange-500 shadow-xl">
                        <CardHeader className="p-4 py-3 bg-orange-50/50 border-b border-orange-100 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-sm font-bold text-orange-900 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-orange-600" />
                                Under Maintenance
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 max-h-64 overflow-y-auto">
                            {courts.map((court, index) => (
                                <div
                                    key={court.id}
                                    className={cn(
                                        "p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50",
                                        "transition-colors"
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-semibold text-sm text-gray-800">{court.name}</span>
                                        <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{court.sport}</span>
                                    </div>
                                    <p className="text-xs text-gray-600 leading-snug">
                                        {court.maintenance_notes || 'Temporarily out of service.'}
                                    </p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
