'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function StatusFilter() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const statusFilter = searchParams.get('status') || 'all'

    const handleChange = (value: string) => {
        router.push(`/admin/feedback?status=${value}`)
    }

    return (
        <div className="flex items-center gap-4">
            <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
                Filter by Status:
            </label>
            <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => handleChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004d40] focus:border-transparent text-gray-900"
            >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
            </select>
        </div>
    )
}
