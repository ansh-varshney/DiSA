'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export function SportFilter() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const sport = searchParams.get('sport') || ''

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedSport = e.target.value
        // Redirect to the same page (equipment or courts) with the selected sport
        router.push(`${pathname}?sport=${selectedSport}`)
    }

    return (
        <div className="flex items-center gap-3">
            <label htmlFor="sport-filter" className="text-sm font-semibold text-gray-900">
                Filter by Sport:
            </label>
            <select
                id="sport-filter"
                value={sport}
                onChange={handleChange}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#004d40] focus:border-transparent"
            >
                <option value="">Select Sport</option>
                <option value="badminton">Badminton</option>
                <option value="tennis">Tennis</option>
                <option value="squash">Squash</option>
                <option value="cricket">Cricket</option>
                <option value="football">Football</option>
                <option value="table tennis">Table Tennis</option>
                <option value="volleyball">Volleyball</option>
                <option value="basketball">Basketball</option>
                <option value="pool">Pool</option>
                <option value="snooker">Snooker</option>
            </select>
        </div>
    )
}
