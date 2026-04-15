import { getFinancialsData } from '@/actions/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, DollarSign, Clock, Package } from 'lucide-react'
import Link from 'next/link'

const SPORT_COLORS: Record<string, string> = {
    badminton: 'bg-green-500',
    tennis: 'bg-yellow-500',
    'table tennis': 'bg-blue-500',
    squash: 'bg-purple-500',
    cricket: 'bg-orange-500',
    football: 'bg-emerald-500',
    volleyball: 'bg-pink-500',
    basketball: 'bg-red-500',
    pool: 'bg-cyan-500',
    snooker: 'bg-indigo-500',
}

function getColor(sport: string) {
    return SPORT_COLORS[sport.toLowerCase()] || 'bg-gray-500'
}

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

export default async function FinancialsDashboard({
    searchParams,
}: {
    searchParams: Promise<{ vendor?: string }>
}) {
    const params = await searchParams
    const selectedVendor = params.vendor || 'all'

    const data = await getFinancialsData(selectedVendor === 'all' ? undefined : selectedVendor)

    const { vendors, total, avgLifespanSessions, totalCost, costBySport, countBySport, lifespanBySport } = data

    // For bar chart scaling
    const maxCost = Math.max(...Object.values(costBySport), 1)
    const maxLifespan = Math.max(...Object.values(lifespanBySport), 1)

    const sportList = Object.keys(costBySport).sort()

    return (
        <div className="p-6 space-y-6 max-w-3xl mx-auto">
            {/* Header */}
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Financials Dashboard</h1>
                <div className="h-px bg-dashed border-t border-dashed border-gray-300 mt-3" />
            </header>

            {/* Vendor Filter */}
            <form method="GET" className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Vendor</label>
                <div className="flex gap-2">
                    <select
                        name="vendor"
                        defaultValue={selectedVendor}
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                    >
                        <option value="all">All Vendors</option>
                        {vendors.map((v) => (
                            <option key={v} value={v}>
                                {v}
                            </option>
                        ))}
                    </select>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-[#004d40] text-white text-sm rounded-md hover:bg-[#004d40]/90 transition-colors"
                    >
                        Apply
                    </button>
                </div>
                {selectedVendor !== 'all' && (
                    <p className="text-xs text-gray-500 italic">* Filtered by vendor: {selectedVendor}</p>
                )}
                {selectedVendor === 'all' && (
                    <p className="text-xs text-gray-500 italic">* Filter by vendor</p>
                )}
            </form>

            {/* Key Metrics */}
            <Card className="border border-gray-900">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Key Metrics
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-[#004d40]" />
                        <span className="text-sm text-gray-700">
                            Avg Equipment Lifespan (expired only):{' '}
                            <span className="font-bold text-gray-900">
                                {avgLifespanSessions !== null
                                    ? `${avgLifespanSessions} sessions`
                                    : 'No expired equipment yet'}
                            </span>
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <DollarSign className="w-5 h-5 text-[#004d40]" />
                        <span className="text-sm text-gray-700">
                            Total Equipment Cost:{' '}
                            <span className="font-bold text-gray-900">
                                {totalCost ? `₹${totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                            </span>
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-[#004d40]" />
                        <span className="text-sm text-gray-700">
                            Total Equipment:{' '}
                            <span className="font-bold text-gray-900">{total} items</span>
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* Equipment Lifespan Chart */}
            <Card className="border border-dashed border-gray-300">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wide text-center">
                        Equipment Lifespan by Sport — avg sessions survived (expired items only)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {Object.keys(lifespanBySport).length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">
                            No lifespan data available
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {Object.entries(lifespanBySport)
                                .sort(([, a], [, b]) => b - a)
                                .map(([sport, days]) => (
                                    <div key={sport}>
                                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                                            <span className="font-medium">{capitalize(sport)}</span>
                                            <span>{days} sessions</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-3">
                                            <div
                                                className={`h-3 rounded-full ${getColor(sport)} transition-all`}
                                                style={{ width: `${Math.round((days / maxLifespan) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Cost Breakdown per Sport Chart */}
            <Card className="border border-dashed border-gray-300">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wide text-center">
                        Cost Breakdown per Sport (₹)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {sportList.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">
                            No cost data available
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {sportList
                                .sort((a, b) => (costBySport[b] || 0) - (costBySport[a] || 0))
                                .map((sport) => {
                                    const cost = costBySport[sport] || 0
                                    const count = countBySport[sport] || 0
                                    return (
                                        <div key={sport}>
                                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                                                <span className="font-medium">
                                                    {capitalize(sport)}{' '}
                                                    <span className="text-gray-400">({count} items)</span>
                                                </span>
                                                <span>
                                                    ₹{cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-3">
                                                <div
                                                    className={`h-3 rounded-full ${getColor(sport)} transition-all`}
                                                    style={{ width: `${Math.round((cost / maxCost) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Drill-down note */}
            <Card className="border border-gray-200">
                <CardContent className="p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Drill-Down</p>
                    <p className="text-sm text-gray-500">
                        View detailed equipment inventory per sport in{' '}
                        <Link href="/admin/equipment" className="text-[#004d40] font-medium underline">
                            Equipment Management
                        </Link>
                        .
                    </p>
                </CardContent>
            </Card>

            {/* Back button */}
            <Link href="/admin">
                <button className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard Hub
                </button>
            </Link>
        </div>
    )
}
