'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function StatusFilter() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const statusFilter = searchParams.get('status') || 'all'
    const categoryFilter = searchParams.get('category') || 'all'

    const handleChange = (key: 'status' | 'category', value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set(key, value)
        router.push(`/admin/feedback?${params.toString()}`)
    }

    return (
        <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Status:</label>
                <select
                    value={statusFilter}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900"
                >
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                </select>
            </div>
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Category:</label>
                <select
                    value={categoryFilter}
                    onChange={(e) => handleChange('category', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900"
                >
                    <option value="all">All Categories</option>
                    <option value="complaint">Complaints</option>
                    <option value="feedback">Feedback</option>
                    <option value="emergency_by_manager">Emergency</option>
                </select>
            </div>
        </div>
    )
}
