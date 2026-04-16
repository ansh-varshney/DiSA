import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Trophy, Medal, Star, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendNotifications } from '@/actions/notifications'

export default async function LeaderboardPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Trigger monthly reset (idempotent — no-op if already reset this month).
    // When a new month's reset runs, the RPC returns the top-5 student IDs that
    // were awarded a priority booking slot so we can notify them here.
    const adminSupabase = createAdminClient()
    const { data: resetResult } = await adminSupabase.rpc('reset_monthly_points')
    if (
        resetResult?.reset_count > 0 &&
        Array.isArray(resetResult?.top5_ids) &&
        resetResult.top5_ids.length > 0
    ) {
        await sendNotifications(
            resetResult.top5_ids.map((id: string) => ({
                recipientId: id,
                type: 'priority_booking_awarded',
                title: 'Monthly Leaderboard Reward!',
                body: 'You finished in the top 5 this month! You have earned a priority booking — book a 90-minute session anytime this month.',
                data: { reward: 'priority_booking' },
            }))
        )
    }

    // Get top 5 students by points
    const { data: topStudents } = await supabase
        .from('profiles')
        .select('id, full_name, points')
        .eq('role', 'student')
        .order('points', { ascending: false })
        .limit(5)

    // Get current user's rank
    const { data: allStudents } = await supabase
        .from('profiles')
        .select('id, points')
        .eq('role', 'student')
        .order('points', { ascending: false })

    const userRank = allStudents?.findIndex((s) => s.id === user.id) ?? -1
    const userProfile = allStudents?.find((s) => s.id === user.id)

    const medalIcons = ['🥇', '🥈', '🥉']

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
                    <Trophy className="w-8 h-8 text-yellow-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
                <p className="text-sm text-gray-500">Monthly top players</p>
            </div>

            {/* Top 5 */}
            <div className="space-y-3">
                {!topStudents || topStudents.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 border-2 border-dashed rounded-xl">
                        No students yet
                    </div>
                ) : (
                    topStudents.map((student: any, index: number) => (
                        <Card
                            key={student.id}
                            className={cn(
                                'transition-all',
                                index === 0 &&
                                    'border-2 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.15)]',
                                student.id === user.id && 'ring-2 ring-[#004d40]'
                            )}
                        >
                            <CardContent className="p-4 flex items-center gap-4">
                                {/* Rank */}
                                <div
                                    className={cn(
                                        'w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shrink-0',
                                        index === 0
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : index === 1
                                              ? 'bg-gray-100 text-gray-600'
                                              : index === 2
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-gray-50 text-gray-500'
                                    )}
                                >
                                    {index < 3 ? medalIcons[index] : index + 1}
                                </div>

                                {/* Name */}
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        {student.full_name || 'Anonymous'}
                                        {student.id === user.id && (
                                            <span className="text-[10px] bg-[#004d40] text-white px-1.5 py-0.5 rounded">
                                                YOU
                                            </span>
                                        )}
                                    </h3>
                                    {index < 5 && (
                                        <p className="text-xs text-yellow-600 flex items-center gap-1">
                                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                            Eligible for 3 consecutive bookings
                                        </p>
                                    )}
                                </div>

                                {/* Points */}
                                <div className="text-right">
                                    <div className="font-black text-lg text-gray-800">
                                        {student.points || 0}
                                    </div>
                                    <div className="text-xs text-gray-400">pts</div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* My Rank */}
            {userRank >= 5 && (
                <div className="pt-4 border-t border-dashed">
                    <p className="text-xs text-gray-400 uppercase font-bold mb-2">Your Position</p>
                    <Card className="ring-2 ring-[#004d40]">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-[#004d40]/10 flex items-center justify-center font-bold text-[#004d40]">
                                {userRank + 1}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-800">You</h3>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" />
                                    Keep playing to climb!
                                </p>
                            </div>
                            <div className="text-right">
                                <div className="font-black text-lg text-gray-800">
                                    {userProfile?.points || 0}
                                </div>
                                <div className="text-xs text-gray-400">pts</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <p className="text-center text-xs text-gray-400 pt-4">
                Top 5 earn eligibility for 3 consecutive bookings. Resets monthly.
            </p>
        </div>
    )
}
