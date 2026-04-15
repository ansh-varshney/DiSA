import { getWelfareTopStats } from '@/actions/analytics'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, BarChart3, Map, Trophy, Users } from 'lucide-react'
import Link from 'next/link'

export default async function StudentWelfarePage() {
    const { successfulBookings } = await getWelfareTopStats()

    return (
        <div className="p-6 space-y-6 max-w-xl mx-auto">
            {/* Header */}
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Student Welfare</h1>
                <div className="h-px border-t border-dashed border-gray-300 mt-3" />
            </header>

            {/* Always-visible top stats */}
            <Card className="border border-gray-900">
                <CardContent className="p-5 space-y-3">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Current Month</p>
                    <p className="text-base text-gray-900">
                        Successful Bookings:{' '}
                        <span className="font-bold text-xl">{successfulBookings.toLocaleString()}</span>
                    </p>
                </CardContent>
            </Card>

            {/* Navigation buttons */}
            <div className="space-y-3">
                <Link href="/admin/analytics/student-welfare/participation">
                    <Card className="border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group">
                        <CardContent className="p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                    <BarChart3 className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900">Participation Stats</p>
                                    <p className="text-xs text-gray-500">Detailed Stats →</p>
                                </div>
                            </div>
                            <span className="text-gray-400 text-lg">›</span>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/admin/analytics/student-welfare/branch-profile">
                    <Card className="border border-gray-200 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group">
                        <CardContent className="p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                                    <Map className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900">Sport Profile</p>
                                    <p className="text-xs text-gray-500">Calendar Heatmap →</p>
                                </div>
                            </div>
                            <span className="text-gray-400 text-lg">›</span>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/admin/analytics/student-welfare/leaderboard">
                    <Card className="border border-gray-200 hover:border-yellow-400 hover:shadow-md transition-all cursor-pointer group">
                        <CardContent className="p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center group-hover:bg-yellow-100 transition-colors">
                                    <Trophy className="w-5 h-5 text-yellow-600" />
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900">Student Leaderboard</p>
                                    <p className="text-xs text-gray-500">Leaderboard →</p>
                                </div>
                            </div>
                            <span className="text-gray-400 text-lg">›</span>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Back */}
            <Link href="/admin">
                <button className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-md py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard Hub
                </button>
            </Link>
        </div>
    )
}
