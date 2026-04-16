import { getBranchProfileData, getBranches } from '@/actions/analytics'
import { BRANCHES as STATIC_BRANCHES } from '@/lib/profile-options'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

// Today in YYYY-MM-DD for the max attr on date inputs
function todayStr() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function BranchProfilePage({
    searchParams,
}: {
    searchParams: Promise<{ branch?: string; xaxis?: string; start?: string; end?: string }>
}) {
    const params = await searchParams
    const branch = params.branch || ''
    const xAxis = params.xaxis || 'sport'
    const startDate = params.start || ''
    const endDate = params.end || ''
    const today = todayStr()

    // Merge DB branches with static list so the dropdown is always populated
    const dbBranches = await getBranches()
    const allBranches = [...new Set([...STATIC_BRANCHES, ...dbBranches])].sort()

    const chartData = branch
        ? await getBranchProfileData(branch, xAxis, startDate || undefined, endDate || undefined)
        : []

    const maxVal = Math.max(...chartData.map((d) => d.Male + d.Female), 1)

    return (
        <div className="p-6 space-y-6 max-w-2xl mx-auto">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Branch Profile</h1>
                <div className="h-px border-t border-dashed border-gray-300 mt-3" />
            </header>

            {/* Single unified form with one Apply button */}
            <form method="GET" className="border border-gray-900 rounded-lg p-4 space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Filters
                </p>

                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Select Branch</label>
                    <select
                        name="branch"
                        defaultValue={branch}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                    >
                        <option value="">Select...</option>
                        <option value="Overall">Overall (all branches)</option>
                        {allBranches.map((b) => (
                            <option key={b} value={b}>
                                {b}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-400 italic">
                        * Must select — includes &apos;Overall&apos;
                    </p>
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Parameter (X-axis)</label>
                    <select
                        name="xaxis"
                        defaultValue={xAxis}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                    >
                        <option value="sport">Sports</option>
                        <option value="year">Year</option>
                    </select>
                    <p className="text-xs text-gray-400 italic">* Sports or Year</p>
                </div>

                {/* Date Range inline */}
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Date Range</label>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-0.5">
                            <p className="text-xs text-gray-500">Start Date</p>
                            <input
                                type="date"
                                name="start"
                                defaultValue={startDate}
                                max={endDate || today}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                            />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-xs text-gray-500">End Date</p>
                            <input
                                type="date"
                                name="end"
                                defaultValue={endDate}
                                min={startDate || undefined}
                                max={today}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                            />
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    className="w-full py-2.5 bg-[#004d40] text-white text-sm font-semibold rounded-md hover:bg-[#004d40]/90 transition-colors"
                >
                    Apply
                </button>
            </form>

            {/* Y-axis label */}
            {branch && (
                <p className="text-sm text-gray-600 font-medium">
                    Y-axis: Number of Successful Sessions
                </p>
            )}

            {/* Dual-bar chart */}
            <Card className="border border-dashed border-gray-300">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wide text-center">
                        {branch
                            ? `${branch} — sessions by ${xAxis === 'sport' ? 'Sport' : 'Year'}`
                            : 'Select branch and filters above'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!branch ? (
                        <p className="text-center text-gray-400 text-sm py-8">
                            Select a branch to load the chart
                        </p>
                    ) : chartData.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">
                            No data found for the selected filters
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {chartData.map((item) => {
                                const malePct = Math.round((item.Male / maxVal) * 100)
                                const femalePct = Math.round((item.Female / maxVal) * 100)
                                return (
                                    <div key={item.label}>
                                        <p className="text-xs font-semibold text-gray-700 mb-1.5">
                                            {item.label}
                                        </p>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] text-blue-600 w-10 shrink-0">
                                                Male
                                            </span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-3">
                                                <div
                                                    className="h-3 rounded-full bg-blue-500"
                                                    style={{ width: `${malePct}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] text-gray-500 w-6 shrink-0">
                                                {item.Male}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-pink-500 w-10 shrink-0">
                                                Female
                                            </span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-3">
                                                <div
                                                    className="h-3 rounded-full bg-pink-400"
                                                    style={{ width: `${femalePct}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] text-gray-500 w-6 shrink-0">
                                                {item.Female}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-0.5 pl-12">
                                            Total: {item.Male + item.Female} sessions
                                        </p>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Legend */}
            {branch && chartData.length > 0 && (
                <Card className="border border-gray-200">
                    <CardContent className="p-4 space-y-1">
                        <p className="text-sm font-semibold text-gray-700">Graph Legend</p>
                        <div className="flex gap-6 text-sm">
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded bg-blue-500 inline-block" />
                                <span className="text-gray-700">Male</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded bg-pink-400 inline-block" />
                                <span className="text-gray-700">Female</span>
                            </span>
                        </div>
                        <p className="text-xs text-gray-400">
                            Each bar shows successful sessions count
                        </p>
                    </CardContent>
                </Card>
            )}

            <Link href="/admin/analytics/student-welfare/participation">
                <button className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Participation Stats
                </button>
            </Link>
        </div>
    )
}
