import { getAdminLeaderboard } from '@/actions/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DateRangeFilter } from '@/components/date-range-filter'
import { ArrowLeft, Medal } from 'lucide-react'
import Link from 'next/link'

function rankIcon(rank: number) {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return null
}

export default async function StudentLeaderboardPage({
    searchParams,
}: {
    searchParams: Promise<{ start?: string; end?: string }>
}) {
    const params = await searchParams
    const startDate = params.start || ''
    const endDate = params.end || ''

    const students = await getAdminLeaderboard(startDate || undefined, endDate || undefined)
    const isDateFiltered = Boolean(startDate || endDate)

    return (
        <div className="p-6 space-y-6 max-w-2xl mx-auto">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Student Leaderboard</h1>
                <div className="h-px border-t border-dashed border-gray-300 mt-3" />
            </header>

            {/* Date Range Filter (client component) */}
            <DateRangeFilter startDefault={startDate} endDefault={endDate} />

            {isDateFiltered && (
                <p className="text-xs text-gray-400 italic -mt-2">
                    Ranked by sessions completed in the selected period. Without a filter, ranked by
                    total points.
                </p>
            )}

            {/* Leaderboard */}
            <Card className="border border-gray-900">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        <Medal className="w-4 h-4" />
                        {isDateFiltered
                            ? `Rankings — ${startDate || '…'} to ${endDate || 'today'}`
                            : 'Rankings — All Time (by Points)'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {students.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-10">
                            No student data found
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {students.map((student: any) => {
                                const icon = rankIcon(student.rank)
                                const isTopThree = student.rank <= 3
                                return (
                                    <div
                                        key={student.id}
                                        className={`flex items-center justify-between px-5 py-3.5 ${isTopThree ? 'bg-yellow-50/50' : ''}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span
                                                className={`text-sm font-bold w-8 shrink-0 ${isTopThree ? 'text-yellow-600' : 'text-gray-400'}`}
                                            >
                                                {icon ?? `${student.rank}.`}
                                            </span>
                                            <div
                                                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${isTopThree ? 'bg-[#004d40]' : 'bg-gray-400'}`}
                                            >
                                                {(student.full_name?.[0] || '?').toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900 leading-tight">
                                                    {student.full_name || 'Unknown'}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {[student.branch, student.year]
                                                        .filter(Boolean)
                                                        .join(' · ') || 'No profile info'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            {isDateFiltered ? (
                                                <p className="text-sm font-bold text-gray-900">
                                                    {(student as any).sessions ?? 0}{' '}
                                                    <span className="text-xs font-normal text-gray-400">
                                                        sessions
                                                    </span>
                                                </p>
                                            ) : (
                                                <p className="text-sm font-bold text-gray-900">
                                                    {(student.points ?? 0).toLocaleString()}{' '}
                                                    <span className="text-xs font-normal text-gray-400">
                                                        pts
                                                    </span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Link href="/admin/analytics/student-welfare">
                <button className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Student Welfare
                </button>
            </Link>
        </div>
    )
}
