'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Past-only date picker — max is today, no min.
 * Used on pages that query historical data (e.g. Booking Logs).
 */
export function PastDatePicker() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const selectedDate = searchParams.get('date') || ''

    const handleDateChange = (date: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('date', date)
        router.push(`?${params.toString()}`)
    }

    const today = new Date().toISOString().split('T')[0]

    return (
        <div className="flex items-center gap-3">
            <label htmlFor="past-date-picker" className="text-sm font-semibold text-gray-900">
                Select Date:
            </label>
            <input
                type="date"
                id="past-date-picker"
                max={today}
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#004d40] focus:border-transparent"
            />
        </div>
    )
}
