import { getParticipationStats } from '@/actions/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DateRangeFilter } from '@/components/date-range-filter'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const PARAMETERS = [
    { value: 'branch', label: 'Branch' },
    { value: 'year', label: 'Year' },
    { value: 'sport', label: 'Sport' },
]

const BAR_COLORS = [
    'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500',
    'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-indigo-500',
    'bg-red-500', 'bg-teal-500',
]

export default async function ParticipationStatsPage({
    searchParams,
}: {
    searchParams: Promise<{ param?: string; start?: string; end?: string }>
}) {
    const params = await searchParams
    const parameter = params.param || 'branch'
    const startDate = params.start || ''
    const endDate = params.end || ''

    const { barData, genderData } = await getParticipationStats(
        parameter,
        startDate || undefined,
        endDate || undefined,
    )

    const maxCount = Math.max(...barData.map((d) => d.count), 1)
    const totalGender = genderData.Male + genderData.Female
    const malePct = totalGender ? Math.round((genderData.Male / totalGender) * 100) : 0
    const femalePct = totalGender ? 100 - malePct : 0

    return (
        <div className="p-6 space-y-6 max-w-2xl mx-auto">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Participation Stats</h1>
                <div className="h-px border-t border-dashed border-gray-300 mt-3" />
            </header>

            {/* Date Range Filter (client component) */}
            <DateRangeFilter
                startDefault={startDate}
                endDefault={endDate}
                extra={{ param: parameter }}
            />

            {/* Parameter selector */}
            <form method="GET" className="flex gap-2 flex-wrap">
                {startDate && <input type="hidden" name="start" value={startDate} />}
                {endDate && <input type="hidden" name="end" value={endDate} />}
                <p className="w-full text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Group by
                    <span className="text-gray-400 font-normal ml-1">* Branch, Year, Sport</span>
                </p>
                <div className="flex gap-2">
                    {PARAMETERS.map((p) => (
                        <button
                            key={p.value}
                            name="param"
                            value={p.value}
                            type="submit"
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                                parameter === p.value
                                    ? 'bg-[#004d40] text-white border-[#004d40]'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-[#004d40]'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </form>

            {/* Bar Graph */}
            <Card className="border border-dashed border-gray-300">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wide text-center">
                        Sessions by {PARAMETERS.find((p) => p.value === parameter)?.label}
                        {(startDate || endDate) && (
                            <span className="text-xs font-normal text-gray-400 ml-2">
                                ({startDate || '…'} → {endDate || 'today'})
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {barData.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">No data for the selected filters</p>
                    ) : (
                        <div className="space-y-3">
                            {barData.map(({ label, count }, i) => (
                                <div key={label}>
                                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span className="font-medium">{label}</span>
                                        <span>{count} sessions</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-3">
                                        <div
                                            className={`h-3 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
                                            style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Gender Split */}
            <Card className="border border-gray-200">
                <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Gender Split</p>
                    {totalGender === 0 ? (
                        <p className="text-sm text-gray-400">No gender data available</p>
                    ) : (
                        <>
                            <div className="flex gap-6 text-sm">
                                <span className="text-blue-700 font-semibold">Male: {malePct}%</span>
                                <span className="text-pink-600 font-semibold">Female: {femalePct}%</span>
                            </div>
                            <Card className="border border-dashed border-gray-300">
                                <CardContent className="p-4">
                                    <p className="text-xs text-gray-400 text-center mb-3 uppercase tracking-wide">
                                        Gender Distribution Chart
                                    </p>
                                    <div className="flex h-6 w-full rounded-full overflow-hidden">
                                        {malePct > 0 && (
                                            <div
                                                className="bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold"
                                                style={{ width: `${malePct}%` }}
                                            >
                                                {malePct >= 10 ? `${malePct}%` : ''}
                                            </div>
                                        )}
                                        {femalePct > 0 && (
                                            <div
                                                className="bg-pink-400 flex-1 flex items-center justify-center text-[10px] text-white font-bold"
                                            >
                                                {femalePct >= 10 ? `${femalePct}%` : ''}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-4 mt-2 justify-center text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Male
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-pink-400 inline-block" /> Female
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Branch Profile Drill-Down */}
            <Link href="/admin/analytics/student-welfare/branch-profile">
                <button className="w-full border-2 border-gray-900 rounded-md py-3 text-sm font-bold text-gray-900 hover:bg-gray-50 transition-colors">
                    Branch Profile Drill-Down
                </button>
            </Link>

            <Link href="/admin/analytics/student-welfare">
                <button className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Student Welfare
                </button>
            </Link>
        </div>
    )
}
