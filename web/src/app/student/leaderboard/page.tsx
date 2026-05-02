import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { profiles } from '@/db/schema'
import { eq, desc, sql, and, or, isNull, inArray } from 'drizzle-orm'
import { Card, CardContent } from '@/components/ui/card'
import { Trophy, Star, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendNotifications } from '@/actions/notifications'

export default async function LeaderboardPage() {
    const session = await auth()
    if (!session?.user?.id) redirect('/login')
    const userId = session.user.id

    // Monthly reset — idempotent, only runs once per month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0] // YYYY-MM-DD

    const needsResetRows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(
            and(
                eq(profiles.role, 'student'),
                or(
                    isNull(profiles.last_points_reset),
                    sql`${profiles.last_points_reset} < ${startOfMonthStr}::date`
                )
            )
        )
        .limit(1)

    if (needsResetRows.length > 0) {
        // Capture top 5 before reset
        const top5 = await db
            .select({ id: profiles.id })
            .from(profiles)
            .where(eq(profiles.role, 'student'))
            .orderBy(desc(profiles.points))
            .limit(5)
        const top5Ids = top5.map((s) => s.id)

        // Award priority booking to top 5
        if (top5Ids.length > 0) {
            await db
                .update(profiles)
                .set({ priority_booking_remaining: 1 })
                .where(inArray(profiles.id, top5Ids))
        }

        // Reset all student points
        const today = new Date().toISOString().split('T')[0]
        await db
            .update(profiles)
            .set({ points: 0, last_points_reset: today })
            .where(
                and(
                    eq(profiles.role, 'student'),
                    or(
                        isNull(profiles.last_points_reset),
                        sql`${profiles.last_points_reset} < ${startOfMonthStr}::date`
                    )
                )
            )

        if (top5Ids.length > 0) {
            await sendNotifications(
                top5Ids.map((id) => ({
                    recipientId: id,
                    type: 'priority_booking_awarded',
                    title: 'Monthly Leaderboard Reward!',
                    body: 'You finished in the top 5 this month! You have earned a priority booking — book a 90-minute session anytime this month.',
                    data: { reward: 'priority_booking' },
                }))
            )
        }
    }

    const topStudents = await db
        .select({ id: profiles.id, full_name: profiles.full_name, points: profiles.points })
        .from(profiles)
        .where(eq(profiles.role, 'student'))
        .orderBy(desc(profiles.points))
        .limit(5)

    const allStudents = await db
        .select({ id: profiles.id, points: profiles.points })
        .from(profiles)
        .where(eq(profiles.role, 'student'))
        .orderBy(desc(profiles.points))

    const userRank = allStudents.findIndex((s: { id: string }) => s.id === userId)
    const userProfile = allStudents.find((s: { id: string }) => s.id === userId)

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
                {topStudents.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 border-2 border-dashed rounded-xl">
                        No students yet
                    </div>
                ) : (
                    topStudents.map((student, index) => (
                        <Card
                            key={student.id}
                            className={cn(
                                'transition-all',
                                index === 0 &&
                                    'border-2 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.15)]',
                                student.id === userId && 'ring-2 ring-[#004d40]'
                            )}
                        >
                            <CardContent className="p-4 flex items-center gap-4">
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

                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        {student.full_name || 'Anonymous'}
                                        {student.id === userId && (
                                            <span className="text-[10px] bg-[#004d40] text-white px-1.5 py-0.5 rounded">
                                                YOU
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-xs text-yellow-600 flex items-center gap-1">
                                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                        Priority 90-min booking reward
                                    </p>
                                </div>

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

            {/* My Rank (if outside top 5) */}
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
