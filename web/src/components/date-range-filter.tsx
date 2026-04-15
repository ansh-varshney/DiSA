'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Props {
    startDefault?: string
    endDefault?: string
    /** Extra hidden fields to preserve in the URL when submitting */
    extra?: Record<string, string>
}

/** Today in YYYY-MM-DD (local time) — used as the max for both pickers */
function today() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export function DateRangeFilter({ startDefault = '', endDefault = '', extra = {} }: Props) {
    const [start, setStart] = useState(startDefault)
    const [end, setEnd] = useState(endDefault)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const todayStr = today()

    const handleApply = () => {
        setError(null)
        if (start && end && end < start) {
            setError('End date must be on or after the start date.')
            return
        }
        const params = new URLSearchParams(searchParams.toString())
        if (start) params.set('start', start)
        else params.delete('start')
        if (end) params.set('end', end)
        else params.delete('end')
        // Preserve extra fields
        for (const [k, v] of Object.entries(extra)) {
            if (v) params.set(k, v)
        }
        router.push(`${pathname}?${params.toString()}`)
    }

    const handleClear = () => {
        setStart('')
        setEnd('')
        setError(null)
        const params = new URLSearchParams(searchParams.toString())
        params.delete('start')
        params.delete('end')
        router.push(`${pathname}?${params.toString()}`)
    }

    const hasFilter = Boolean(startDefault || endDefault)

    return (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date Range</p>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Start Date</label>
                    <input
                        type="date"
                        value={start}
                        max={end || todayStr}
                        onChange={(e) => {
                            setStart(e.target.value)
                            // If end is now before new start, clear end
                            if (end && e.target.value > end) setEnd('')
                        }}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">End Date</label>
                    <input
                        type="date"
                        value={end}
                        min={start || undefined}
                        max={todayStr}
                        onChange={(e) => setEnd(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                    />
                </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={handleApply}
                    className="flex-1 py-2 bg-[#004d40] text-white text-sm font-semibold rounded-md hover:bg-[#004d40]/90 transition-colors"
                >
                    Apply
                </button>
                {hasFilter && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    )
}
