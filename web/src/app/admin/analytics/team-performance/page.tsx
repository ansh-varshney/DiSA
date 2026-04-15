import { getTeamPerformanceData } from '@/actions/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DateRangeFilter } from '@/components/date-range-filter'
import { ArrowLeft, Trophy, Swords, XCircle, Star, Dumbbell } from 'lucide-react'
import Link from 'next/link'

const SPORTS = [
    'badminton', 'tennis', 'table tennis', 'squash',
    'cricket', 'football', 'volleyball', 'basketball', 'pool', 'snooker',
]

function capitalize(s: string) {
    return s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default async function TeamPerformanceDashboard({
    searchParams,
}: {
    searchParams: Promise<{ sport?: string; start?: string; end?: string }>
}) {
    const params = await searchParams
    const selectedSport = params.sport || ''
    const startDate = params.start || ''
    const endDate = params.end || ''

    const data = await getTeamPerformanceData(selectedSport || undefined, startDate || undefined, endDate || undefined)
    const { practiceSessions, tournaments, wins, losses, trophies, monthlyPractice } = data
    const maxMonthly = Math.max(...monthlyPractice.map((m) => m.count), 1)

    return (
        <div className="p-6 space-y-6 max-w-3xl mx-auto">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Team Performance</h1>
                <div className="h-px border-t border-dashed border-gray-300 mt-3" />
            </header>

            {/* Sport Filter */}
            <form method="GET" className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Sport</label>
                <div className="flex gap-2">
                    <select name="sport" defaultValue={selectedSport}
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]">
                        <option value="">Select sport</option>
                        {SPORTS.map((s) => <option key={s} value={s}>{capitalize(s)}</option>)}
                    </select>
                    {startDate && <input type="hidden" name="start" value={startDate} />}
                    {endDate && <input type="hidden" name="end" value={endDate} />}
                    <button type="submit"
                        className="px-4 py-2 bg-[#004d40] text-white text-sm rounded-md hover:bg-[#004d40]/90 transition-colors">
                        Apply
                    </button>
                </div>
                <p className="text-xs text-gray-400 italic">* Select sport</p>
            </form>

            {/* Date Range Filter (client component) */}
            <DateRangeFilter
                startDefault={startDate}
                endDefault={endDate}
                extra={{ sport: selectedSport }}
            />

            {/* Stats */}
            {!selectedSport ? (
                <Card className="border border-gray-200">
                    <CardContent className="py-12 text-center text-gray-400 text-sm">
                        Select a sport to view team statistics
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card className="border border-gray-900">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                Team Statistics — {capitalize(selectedSport)}
                                {(startDate || endDate) && (
                                    <span className="text-xs font-normal text-gray-400 ml-2">
                                        ({startDate || '…'} → {endDate || 'today'})
                                    </span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                                <StatCard icon={<Swords className="w-5 h-5 text-blue-600" />} label="Tournaments Played" value={tournaments} bg="bg-blue-50" />
                                <StatCard icon={<Trophy className="w-5 h-5 text-green-600" />} label="Wins" value={wins} bg="bg-green-50" />
                                <StatCard icon={<XCircle className="w-5 h-5 text-red-600" />} label="Losses" value={losses} bg="bg-red-50" />
                                <StatCard icon={<Star className="w-5 h-5 text-yellow-500" />} label="Trophies" value={trophies} bg="bg-yellow-50" />
                                <StatCard icon={<Dumbbell className="w-5 h-5 text-[#004d40]" />} label="Practice Sessions" value={practiceSessions} bg="bg-[#004d40]/10" highlight />
                            </div>
                            {tournaments === 0 && (
                                <p className="text-xs text-gray-400 mt-4 text-center">
                                    Tournament data is not yet tracked. Practice sessions are derived from completed bookings.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Monthly practice sessions chart */}
                    <Card className="border border-dashed border-gray-300">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wide text-center">
                                Practice Sessions by Month
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {monthlyPractice.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-8">No sessions found for the selected filters</p>
                            ) : (
                                <div>
                                    <div className="flex items-end gap-2 h-40 mt-4">
                                        {monthlyPractice.map(({ month, count }) => (
                                            <div key={month} className="flex-1 flex flex-col items-center gap-1">
                                                <span className="text-xs font-semibold text-gray-700">{count}</span>
                                                <div className="w-full flex items-end justify-center">
                                                    <div className="w-full bg-[#004d40] rounded-t"
                                                        style={{ height: `${Math.round((count / maxMonthly) * 120)}px`, minHeight: '4px' }} />
                                                </div>
                                                <span className="text-[10px] text-gray-500 text-center leading-tight">{month}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 mt-3 justify-center">
                                        <div className="w-3 h-3 rounded bg-[#004d40]" />
                                        <span className="text-xs text-gray-500">Practice Sessions (completed bookings)</span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            <Link href="/admin">
                <button className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard Hub
                </button>
            </Link>
        </div>
    )
}

function StatCard({ icon, label, value, bg, highlight }: {
    icon: React.ReactNode; label: string; value: number; bg: string; highlight?: boolean
}) {
    return (
        <div className={`rounded-lg p-4 ${bg} flex flex-col gap-2`}>
            <div className="flex items-center gap-2">
                {icon}
                <span className={`text-xs font-medium ${highlight ? 'text-[#004d40]' : 'text-gray-600'}`}>{label}</span>
            </div>
            <span className={`text-2xl font-bold ${highlight ? 'text-[#004d40]' : 'text-gray-900'}`}>{value}</span>
        </div>
    )
}
